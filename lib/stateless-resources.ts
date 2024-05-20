/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions.
 * Security Groups, IAM permissions.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';
import * as path from 'path';


interface StatelessResourceProps extends cdk.StackProps {
  deployEnv: string;
  vpc: cdk.aws_ec2.Vpc;
  config: Readonly<StackConfig>;
}

export class StatelessResourceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StatelessResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc } = props;
    
    const exampleLambda = new cdk.aws_lambda.Function(this, `${deployEnv}-${commonConstants.project}-exampleLambda`, {
        functionName: `example-lambda-${deployEnv}`,
        code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname,"../assets")),
        runtime: cdk.aws_lambda.Runtime.PYTHON_3_12,
        handler: `example-lambda-${deployEnv}.lambda_handler`,
        environment: {
          "env": deployEnv
        },
    });
  }
}
