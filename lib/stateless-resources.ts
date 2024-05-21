/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';


interface StatelessResourceProps extends cdk.StackProps {
  deployEnv: string;
  vpc: cdk.aws_ec2.Vpc;
  config: Readonly<StackConfig>;
}

export class StatelessResourceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc, config } = props;
    /**
     * Log bucket (in early stage of development, maybe it's best to set DESTROY RemovalPolicy)
     */
    const loggingBucket = cdk.aws_s3.Bucket.fromBucketName(this, "loggingBucket", `${commonConstants.project}-logging-bucket`);
    loggingBucket.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    /**
     * Route 53 and Certs
     */
    const hostZone = new cdk.aws_route53.HostedZone(this, `${deployEnv}-${commonConstants.project}-hostZone`, {
      zoneName: config.domainName
    });

    const certificate = new cdk.aws_certificatemanager.Certificate(this, `${deployEnv}-${commonConstants.project}-cert`, {
      domainName: config.domainName,
      subjectAlternativeNames: [`*.${config.domainName}`],
      validation: cdk.aws_certificatemanager.CertificateValidation.fromDns(hostZone),
    });

    /**
     * Load balancer
     */
    const lbSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, `${deployEnv}-${commonConstants.project}-LoadBalancerSecurityGroup`, {
      vpc: vpc,
      allowAllOutbound: true,
    });
    lbSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80), "Allow inbound traffic on port 80");
    lbSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(443), "Allow inbound traffic on port 443");
    
    const loadBalancer = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, `${deployEnv}-${commonConstants.project}-lb`, {
      loadBalancerName: `${deployEnv}-${commonConstants.project}-lb`,
      vpc: vpc,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
      },
      internetFacing: true,
      securityGroup: lbSecurityGroup,
    });
    loadBalancer.logAccessLogs(loggingBucket, `loadBalancer/${deployEnv}`);

    //default listener and rule
    loadBalancer.addListener("listenerHttp", {
      port: 80,
      defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.redirect({ port: "443", protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS })
    });

    const httpsListener = loadBalancer.addListener("listenerHttps", {
      port: 443,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.fixedResponse(404, {
        contentType: "text/html",
        messageBody: "お指定URLをご確認ください！"
      }),
      sslPolicy: cdk.aws_elasticloadbalancingv2.SslPolicy.TLS12
    });

    /**
     * Compute Resource (ECS)
     */
    //Image Repo
    const backendECRRepo =  new cdk.aws_ecr.Repository(this, `${deployEnv}-backend-ecrRepo`,{
      repositoryName: `backend-${deployEnv}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    //Cluster
    const cluster = new cdk.aws_ecs.Cluster(this, `${deployEnv}-cluster`, {
      vpc: vpc,
      clusterName: `${deployEnv}-${commonConstants.project}-cluster`
    });

    //Task Definition
    const taskDefBackend = new cdk.aws_ecs.FargateTaskDefinition(this, `${deployEnv}-backend-taskDef`);
    const taskDefBackendLogGroup = new cdk.aws_logs.LogGroup(this, `${deployEnv}-backend-logGroup`, {logGroupName: `/${deployEnv}/ecs/backend`});
    taskDefBackend.addContainer("apiContainer", {
      image: cdk.aws_ecs.ContainerImage.fromEcrRepository(backendECRRepo),
      portMappings: [
        {
          containerPort: 80,
        },
      ],
      secrets: {
        // DB_PORT: cdk.aws_ecs.Secret.fromSsmParameter(cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "port_value", { parameterName: `/${deployEnv}/db_port` })),
        // DB_USERNAME: cdk.aws_ecs.Secret.fromSsmParameter(cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "username_value", { parameterName: `/${deployEnv}/db_username` })),
        // DB_PASSWORD: cdk.aws_ecs.Secret.fromSsmParameter(cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "password_value", { parameterName: `/${deployEnv}/db_password` })),
        // DB_DATABASE: cdk.aws_ecs.Secret.fromSsmParameter(cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "db_value", { parameterName: `/${deployEnv}/db_database` })),
      },
      environment: {
      },
      logging: cdk.aws_ecs.LogDrivers.awsLogs({ streamPrefix: `${deployEnv}`,logGroup: taskDefBackendLogGroup }),
    });
    taskDefBackend.addToTaskRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      resources: [`*`]
    }));

    //Service
    const backendService = new cdk.aws_ecs.FargateService(this, `${deployEnv}-backend-service`, {
      cluster: cluster,
      taskDefinition: taskDefBackend,
      serviceName: "backend-service",
      deploymentController: {
        type: cdk.aws_ecs.DeploymentControllerType.CODE_DEPLOY,
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
  }
}
