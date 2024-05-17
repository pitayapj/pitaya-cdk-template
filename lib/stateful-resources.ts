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


interface StatefulResourceProps extends cdk.StackProps {
  deployEnv: string;
  vpc: cdk.aws_ec2.Vpc;
  //config: Readonly<StackConfig>;
}

export class StatefulResourceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StatefulResourceProps) {
    super(scope, id, props);
    const { deployEnv, vpc } = props;

    const databasePort = 35527;

    const dbSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, `${deployEnv}-db-sg`,{
        vpc: vpc,
        allowAllOutbound: true,
    });
    dbSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.ipv4(vpc.vpcCidrBlock), cdk.aws_ec2.Port.tcp(databasePort), "Allow inbound traffic to database");

    const parameterGroup = new cdk.aws_rds.ParameterGroup(this, `${deployEnv}-parameter-group`, {
        engine: cdk.aws_rds.DatabaseInstanceEngine.postgres({ version: cdk.aws_rds.PostgresEngineVersion.VER_14_7 }),
        description: `${deployEnv} postGre database parameter group`
    })

    const postGre = new cdk.aws_rds.DatabaseInstance(this, `${deployEnv}-ems-database`,{
        instanceIdentifier: `ems-ra-${deployEnv}`,
        databaseName: cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "postGre-database", { parameterName: `/${deployEnv}/db_database` }).stringValue,
        engine: cdk.aws_rds.DatabaseInstanceEngine.postgres({ version: cdk.aws_rds.PostgresEngineVersion.VER_14_7 }),
        vpc: vpc,
        vpcSubnets:{
            subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        allocatedStorage: 20,
        instanceType: cdk.aws_ec2.InstanceType.of(cdk.aws_ec2.InstanceClass.BURSTABLE3, deployEnv == "prod" ? cdk.aws_ec2.InstanceSize.SMALL : cdk.aws_ec2.InstanceSize.MICRO ),
        securityGroups: [dbSecurityGroup],
        credentials: cdk.aws_rds.Credentials.fromPassword(
            cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "postGre-acc", { parameterName: `/${deployEnv}/db_username` }).stringValue,
            cdk.SecretValue.unsafePlainText(cdk.aws_ssm.StringParameter.fromStringParameterAttributes(this, "postGre-pw", { parameterName: `/${deployEnv}/db_password` }).stringValue)
        ),
        port: databasePort,
        parameterGroup: parameterGroup,
        multiAz: deployEnv == "prod" ? true : false,
        performanceInsightRetention: cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
    });
  
  }
}
