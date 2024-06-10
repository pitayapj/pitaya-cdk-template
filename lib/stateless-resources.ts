/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import {
  Stack,
  StackProps,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_certificatemanager as certificatemanager,
  aws_route53 as route53,
  aws_elasticloadbalancingv2 as lbv2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_iam as iam
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';
import * as path from 'path';


interface StatelessResourceProps extends StackProps {
  deployEnv: string;
  vpc: ec2.Vpc;
  config: Readonly<StackConfig>;
}

export class StatelessResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc, config } = props;
    /**
     * Log bucket (in early stage of development, maybe it's best to set DESTROY RemovalPolicy)
     */
    const loggingBucket = s3.Bucket.fromBucketName(this, "loggingBucket", `${commonConstants.project}-logging-bucket`);
    loggingBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);

    /**
     * Route 53 and Certs
     */
    const hostZone = new route53.HostedZone(this, `${deployEnv}-${commonConstants.project}-hostZone`, {
      zoneName: config.domainName
    });

    const certificate = new certificatemanager.Certificate(this, `${deployEnv}-${commonConstants.project}-cert`, {
      domainName: config.domainName,
      subjectAlternativeNames: [`*.${config.domainName}`],
      validation: certificatemanager.CertificateValidation.fromDns(hostZone),
    });

    /**
     * Load balancer
     */
    const lbSecurityGroup = new ec2.SecurityGroup(this, `${deployEnv}-${commonConstants.project}-LoadBalancerSecurityGroup`, {
      vpc: vpc,
      allowAllOutbound: true,
    });
    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow inbound traffic on port 80");
    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow inbound traffic on port 443");
    
    const loadBalancer = new lbv2.ApplicationLoadBalancer(this, `${deployEnv}-${commonConstants.project}-lb`, {
      loadBalancerName: `${deployEnv}-${commonConstants.project}-lb`,
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      internetFacing: true,
      securityGroup: lbSecurityGroup,
    });
    loadBalancer.logAccessLogs(loggingBucket, `loadBalancer/${deployEnv}`);

    //default listener and rule
    loadBalancer.addListener("listenerHttp", {
      port: 80,
      defaultAction: lbv2.ListenerAction.redirect({ port: "443", protocol: lbv2.ApplicationProtocol.HTTPS })
    });

    const httpsListener = loadBalancer.addListener("listenerHttps", {
      port: 443,
      protocol: lbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: lbv2.ListenerAction.fixedResponse(404, {
        contentType: "text/html",
        messageBody: "お指定URLをご確認ください！"
      }),
      sslPolicy: lbv2.SslPolicy.TLS12
    });

    /**
     * Compute Resource (ECS)
     */
    //Image Repo
    const backendECRRepo =  new ecr.Repository(this, `${deployEnv}-backend-ecrRepo`,{
      repositoryName: `backend-${deployEnv}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //Cluster
    const cluster = new ecs.Cluster(this, `${deployEnv}-cluster`, {
      vpc: vpc,
      clusterName: `${deployEnv}-${commonConstants.project}-cluster`
    });

    //Task Definition
    const taskDefBackend = new ecs.FargateTaskDefinition(this, `${deployEnv}-backend-taskDef`);
    const taskDefBackendLogGroup = new logs.LogGroup(this, `${deployEnv}-backend-logGroup`, {logGroupName: `/${deployEnv}/ecs/backend`});
    taskDefBackend.addContainer("apiContainer", {
      image: ecs.ContainerImage.fromEcrRepository(backendECRRepo),
      portMappings: [
        {
          containerPort: 80,
        },
      ],
      secrets: {
        // DB_PORT: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "port_value", { parameterName: `/${deployEnv}/db_port` })),
        // DB_USERNAME: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "username_value", { parameterName: `/${deployEnv}/db_username` })),
        // DB_PASSWORD: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "password_value", { parameterName: `/${deployEnv}/db_password` })),
        // DB_DATABASE: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromStringParameterAttributes(this, "db_value", { parameterName: `/${deployEnv}/db_database` })),
      },
      environment: {
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${deployEnv}`,logGroup: taskDefBackendLogGroup }),
    });
    taskDefBackend.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      resources: [`*`]
    }));

    //Service
    const backendService = new ecs.FargateService(this, `${deployEnv}-backend-service`, {
      cluster: cluster,
      taskDefinition: taskDefBackend,
      serviceName: "backend-service",
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      desiredCount: 1,
      assignPublicIp: true //if not set, task will be place in private subnet
    });

    //Auto Scale (max to 5 task, scale when CPU Reach 70%)
    const scalableTarget = backendService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    });
    
    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });
    
    /**
     * Deploy Pipeline
     */


    /**Lambda function */
    const exampleLambda = new lambda.Function(this, `${deployEnv}-${commonConstants.project}-exampleLambda`, {
      functionName: `example-lambda-${deployEnv}`,
      code: lambda.Code.fromAsset(path.join(__dirname,"../assets")),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: `example-lambda-${deployEnv}.lambda_handler`,
      environment: {
        "env": deployEnv
      },
  });
  }
}
