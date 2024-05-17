/**
 * -> Things declared in here will be references by other stacks!
 * -> NOT RECOMMENDED for declaring resources that changes regularly!
 * -> Things declared in here should be free, stateless, not delete resources.
 * For ex: VPC, a few SG, a EIP for NAT Gateway
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackConfig } from './parameters/env-config';
import { commonConstants } from '../lib/parameters/constants';


interface BaseNetWorkProps extends cdk.StackProps {
  deployEnv: string;
  config: Readonly<StackConfig>;
}

export class BaseNetworkStack extends cdk.Stack {
  public readonly vpc: cdk.aws_ec2.Vpc;
  constructor(scope: Construct, id: string, props: BaseNetWorkProps) {
    super(scope, id, props);
    const { deployEnv, config } = props;

    const eipAddress = new cdk.aws_ec2.CfnEIP(this, `${deployEnv}IpAddress`,{
      
    });

    this.vpc = new cdk.aws_ec2.Vpc(this, `${deployEnv}-${commonConstants.project}-vpc`, {
      vpcName: `${deployEnv}-${commonConstants.project}-vpc`,
      ipAddresses: cdk.aws_ec2.IpAddresses.cidr(config.cidrBlock),
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      natGateways: 1,
      natGatewayProvider: cdk.aws_ec2.NatProvider.gateway({ eipAllocationIds: [eipAddress.attrAllocationId] }),
    });
  }
}
