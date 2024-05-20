/**
 * Stateless resources. 
 * Load Balancer, Compute Resources, Deploy Pipelines, Lambda functions
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
    const { deployEnv, vpc } = props;
  
  }
}
