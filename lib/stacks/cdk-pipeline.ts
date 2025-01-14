import {
  pipelines as cdkpipeline,
  Stack,
  StackProps,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { commonConstants } from '../parameters/constants';
import { resolveConfig } from '../../lib/parameters/env-config';
import { AppStage } from '../stages/app-stage';

interface CDKPipelineStackProps extends StackProps {
  infraStatus: "on" | "off",
}

export class CdkPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: CDKPipelineStackProps) {
    super(scope, id, props);

    const { infraStatus } = props;

    const config = resolveConfig();
    // Development Environment
    const devStage = new AppStage(this, `cdk-pipeline-stage-dev`, {
      env: {account: config.awsAccount, region: config.region},
      deployEnv: 'dev',
      infraStatus: infraStatus,
    });

    // Staging Environment
    const stgStage = new AppStage(this, `cdk-pipeline-stage-stg`, {
      env: {account: config.awsAccount, region: config.region},
      deployEnv: 'stg',
      infraStatus: 'on',
    });

    // Production Environment
    const prodStage = new AppStage(this, `cdk-pipeline-stage-prod`, {
      env: {account: config.awsAccount, region: config.region},
      deployEnv: 'prod',
      infraStatus: 'on',
    });

    const cdkPipeline = new cdkpipeline.CodePipeline(this, `${commonConstants.project}-cdk-pipeline`, {
      synth: new cdkpipeline.CodeBuildStep(`project-synth`, {
        input: cdkpipeline.CodePipelineSource.connection(config.infraRepo, 'main', {
          connectionArn: config.githubConnection
        }),
        commands: [
          `aws ssm get-parameter --with-decryption --name /cdk/env --output text --query 'Parameter.Value' > .env`,
          'npm ci', 'npm run build', 'npx cdk synth',
          'pip3 install ansi2html',
          `{ echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" ; FORCE_COLOR=1 npx cdk diff "CDKPipelineStack/stg/**" 2>&1; } | ansi2html > cdk-diff-output-stg.html`,
          `{ echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" ; FORCE_COLOR=1 npx cdk diff "CDKPipelineStack/prod/**" 2>&1; } | ansi2html > cdk-diff-output-prod.html`,
        ],
        rolePolicyStatements: [
          new iam.PolicyStatement({
            resources: [
              `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk/env`,
              `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk/env`
            ],
            actions: ["ssm:GetParameter*"],
          }),
        ],
      }),
    });

    cdkPipeline.addStage(devStage);

    cdkPipeline.addStage(stgStage);

    cdkPipeline.addStage(prodStage, {
      pre: [new cdkpipeline.ManualApprovalStep('production-deployment-approval')],
    });

  }
}