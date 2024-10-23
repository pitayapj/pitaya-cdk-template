/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_certificatemanager as certificatemanager,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
  aws_elasticloadbalancingv2 as lbv2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_iam as iam,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as codepipeline_actions,
  aws_codebuild as codebuild,
  aws_codedeploy as codedeploy,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as cloudfront_origins,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';
import * as path from 'path';


interface StatelessResourceProps extends StackProps {
  deployEnv: string;
  vpc: ec2.Vpc;
  hostZone: route53.HostedZone;
  config: Readonly<StackConfig>;
}

export class StatelessResourceStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc, config, hostZone } = props;
    /**
     * Log bucket (in early stage of development, maybe it's best to set DESTROY RemovalPolicy)
     */
    const loggingBucket = new s3.Bucket(this, `logging-bucket-${deployEnv}`, {
      bucketName: `${commonConstants.project}-logging-bucket`,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER
    });
    loggingBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);

    /**
     * Certs 
     * There is no real good way to get certificate for Cloudfront. See more -> https://github.com/aws/aws-cdk/discussions/23931
     * So, we gonna create it with a deprecated function.
     */
    const lbCert = new certificatemanager.Certificate(this, `${deployEnv}-${commonConstants.project}-cert`, {
      domainName: config.domainName,
      subjectAlternativeNames: [`*.${config.domainName}`],
      validation: certificatemanager.CertificateValidation.fromDns(hostZone),
    });

    const cloudfrontCert = new certificatemanager.DnsValidatedCertificate(this, `${deployEnv}-${commonConstants.project}-cloudfront-cert`, {
      domainName: config.domainName,
      subjectAlternativeNames: [`api.${config.domainName}`],
      hostedZone: hostZone,
      // the properties below are set for validation in us-east-1
      region: 'us-east-1',
      validation: certificatemanager.CertificateValidation.fromDns(hostZone),
    });

    /**
     * Load balancer
     */
    const lbSecurityGroup = new ec2.SecurityGroup(this, `${deployEnv}-${commonConstants.project}-lb-security-group`, {
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
      certificates: [lbCert],
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
    const apiECRRepo = new ecr.Repository(this, `${deployEnv}-api-ecr-repo`, {
      repositoryName: `api-${deployEnv}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //Cluster
    const cluster = new ecs.Cluster(this, `${deployEnv}-cluster`, {
      vpc: vpc,
      clusterName: `${deployEnv}-${commonConstants.project}-cluster`
    });

    //Task Definition
    const taskDefApi = new ecs.FargateTaskDefinition(this, `${deployEnv}-api-task-def`);
    const taskDefApiLogGroup = new logs.LogGroup(this, `${deployEnv}-Api-logGroup`, { logGroupName: `/${deployEnv}/ecs/Api`, removalPolicy: RemovalPolicy.DESTROY });
    taskDefApi.addContainer("apiContainer", {
      image: ecs.ContainerImage.fromEcrRepository(apiECRRepo),
      portMappings: [
        {
          containerPort: 8888,
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
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${deployEnv}`, logGroup: taskDefApiLogGroup }),
    });
    taskDefApi.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      resources: [`*`]
    }));

    //Service
    const apiService = new ecs.FargateService(this, `${deployEnv}-api-service`, {
      cluster: cluster,
      taskDefinition: taskDefApi,
      serviceName: "api-service",
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
      desiredCount: 0,
      assignPublicIp: true, //if not set, task will be place in private subnet
    });

    //Auto Scale (max to 5 task, scale when CPU Reach 70%)
    const scalableTarget = apiService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });

    const apiBlueTg = httpsListener.addTargets(`blue-api-target-${deployEnv}`, {
      priority: 1,
      port: 8888,
      protocol: lbv2.ApplicationProtocol.HTTP,
      conditions: [
        lbv2.ListenerCondition.hostHeaders([`api.${config.domainName}`]),
        // cdk.aws_elasticloadbalancingv2.ListenerCondition.pathPatterns(["/api/*"]),
      ],
      targets: [apiService],
      healthCheck: {
        path: "/ping"
      }
    });

    const apiGreenTg = new lbv2.ApplicationTargetGroup(this, `green-api-target-${deployEnv}`, {
      vpc: vpc,
      port: 8888,
      protocol: lbv2.ApplicationProtocol.HTTP,
      targetType: lbv2.TargetType.IP,
      healthCheck: {
        path: "/ping"
      },
    });

    /**
     * Cloudfront Distributions
     */
    //Backend Distribution
    const backendOriginResponsePolicy = new cloudfront.ResponseHeadersPolicy(this, `cloudfront-backend-response-policy-${deployEnv}`, {
      responseHeadersPolicyName: `cloudfront-backend-response-policy-${deployEnv}`,
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ['Authorization', '*'], // * alone does NOT include Authorization header. Need to write it specifically
        accessControlAllowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD'],
        accessControlAllowOrigins: [`https://${config.domainName}`],
        // accessControlExposeHeaders: [],
        accessControlMaxAge: Duration.seconds(600),
        originOverride: true,
      }
    });

    const backendCloudfront = new cloudfront.Distribution(this, `backend-cloudfront-${deployEnv}`, {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new cloudfront_origins.LoadBalancerV2Origin(loadBalancer, {
          // To make sure request is coming from our Distribution, we may add this custom header to Cloudfront and LoadBalancer
          // customHeaders: {
          //   "X-Custom-Header": commonConstants.project
          // }
        }),
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
        responseHeadersPolicy: backendOriginResponsePolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      },
      enableLogging: true,
      logBucket: loggingBucket,
      logFilePrefix: `cloudfront/${deployEnv}/`,
      certificate: cloudfrontCert,
      domainNames: [`api.${config.domainName}`],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, //include Japan but not all
      // Custom for Frontend Distribution
      // If frontend is a React SPA app hosting in S3, we will needed in including below code (to change behavior when user reload page)
      // errorResponses: [
      //   {
      //     httpStatus: 404,
      //     responseHttpStatus: 200,
      //     responsePagePath: "/index.html",
      //     ttl: Duration.seconds(0),
      //   }
      // ]
    });

    new route53.ARecord(this, `api-record-${deployEnv}`, {
      zone: hostZone,
      target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(backendCloudfront)),
      recordName: `api.${config.domainName}`,
    });

    /**
     * Deploy Pipeline
     */
    //Codebuild permission 
    const codebuildRole = new iam.Role(this, `codebuild-role-${deployEnv}`, {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    codebuildRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["ecr:*", "ssm:GetParameters", "ecs:UpdateService", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:TagResource"],
    }));

    codebuildRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["iam:PassRole"],
    }));

    //Source
    const sourceOutputApi = new codepipeline.Artifact();
    const sourceActionApi = new codepipeline_actions.CodeStarConnectionsSourceAction({
      actionName: "GithubSource",
      owner: "long2205",
      branch: config.githubBranch,
      repo: "ecs-example-api-repo",
      output: sourceOutputApi,
      connectionArn: commonConstants.codestarConnectionARN
    });
    //Build
    const buildOutputApi = new codepipeline.Artifact();
    const buildProjectApi = new codebuild.Project(this, `api-build-project${deployEnv}`, {
      projectName: `api-build-${deployEnv}`,
      role: codebuildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "echo Logging in to Amazon ECR...",
              "aws --version",
              "$(aws ecr get-login --no-include-email --region $AWS_REGION)",
              "COMMIT_ID=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -b -8)"
            ]
          },
          build: {
            commands: [
              "echo Build started on `date`",
              // Front end build might need to supply api URL beforehand 
              // "docker build --build-arg react_app_url=" + react_app_url + " --build-arg react_google_id=" +react_google_id + " -t " + ecrDashboardRepo.repositoryUri + ":latest ."
              "docker build -t " + apiECRRepo.repositoryUri + ":$COMMIT_ID .",
              "docker image tag " + apiECRRepo.repositoryUri + ":$COMMIT_ID " + apiECRRepo.repositoryUri + ":latest"
            ]
          },
          post_build: {
            commands: [
              "echo Build completed on `date`",
              "echo Pushing the Docker image...",
              "docker push " + apiECRRepo.repositoryUri + ":$COMMIT_ID",
              "docker push " + apiECRRepo.repositoryUri + ":latest",
              // In case we have taskdef file in source code: at deploy/task-definition.${deployEnv}.json
              // `NEW_TASK_INFO=$(aws ecs register-task-definition --cli-input-json file://./deploy/task-definition.${deployEnv}.json ) `,
              // "NEW_REVISION=$(echo $NEW_TASK_INFO | jq '.taskDefinition.revision') ",
              // "aws ecs describe-task-definition --task-definition " + taskDefApi.family + ":$NEW_REVISION | jq '.taskDefinition' > taskdef.json",
              "aws ecs describe-task-definition --task-definition " + taskDefApi.taskDefinitionArn + " | jq '.taskDefinition' > taskdef.json",
              `sed -i 's|"image": "[^"]*"|"image": "<BUILD_IMAGE_URI>"|' taskdef.json`,
              `printf '{"ImageURI":"${apiECRRepo.repositoryUri}:%s"}' "$COMMIT_ID" > imageDetail.json`,
              //you need an appspec file in your code, and it has to declare CapacityProvider. Check appspec.yaml in root folder for reference
              deployEnv != "prod" ? "sed -i 's/FARGATE/FARGATE_SPOT/g' appspec.yaml" : "",
            ],
          }
        },
        artifacts: {
          files: [
            "appspec.yaml",
            "taskdef.json",
            "imageDetail.json"
          ]
        }
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        privileged: true,
      },
    });

    //Deploy
    const ecsDeployApiGroup = new codedeploy.EcsDeploymentGroup(this, `api-blue-green-deploy-group-${deployEnv}`, {
      service: apiService,
      blueGreenDeploymentConfig: {
        blueTargetGroup: apiBlueTg,
        greenTargetGroup: apiGreenTg,
        listener: httpsListener,
      },
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE,
    });

    //Pipeline
    const pipelineApi = new codepipeline.Pipeline(this, `api-pipeline-${deployEnv}`, {
      pipelineName: `api-pipeline-${deployEnv}`,
      stages: [
        {
          stageName: "Source",
          actions: [sourceActionApi],
        },
        {
          stageName: "Build",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "Build_Docker_Api_Image",
              project: buildProjectApi,
              input: sourceOutputApi,
              outputs: [buildOutputApi]
            }),
          ],
        },
        {
          stageName: "Deploy",
          actions: [
            new codepipeline_actions.CodeDeployEcsDeployAction({
              actionName: "BlueGreen_ECSDeploy",
              deploymentGroup: ecsDeployApiGroup,
              appSpecTemplateInput: buildOutputApi,
              taskDefinitionTemplateInput: buildOutputApi,
              containerImageInputs: [
                {
                  input: buildOutputApi,
                  taskDefinitionPlaceholder: "BUILD_IMAGE_URI"
                }
              ]
            }),
          ],
        },
      ],
      crossAccountKeys: false
    });
    pipelineApi.artifactBucket.applyRemovalPolicy(RemovalPolicy.DESTROY);


    /**Lambda function */
    const invalidationLambda = new lambda.Function(this, `${deployEnv}-${commonConstants.project}-invalidate-lambda`, {
      functionName: `cloudfront-invalidation-${deployEnv}`,
      code: lambda.Code.fromAsset(path.join(__dirname, "../assets")),
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: `invalidation.lambda_handler`,
      environment: {
        "env": deployEnv
      },
    });
    invalidationLambda.addToRolePolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["cloudfront:CreateInvalidation"],
    }));
  }
}
