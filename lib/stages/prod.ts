/**
 * A stage is a composition of stack(s)
 * In this file dev.ts I am declaring everything that will be use in Development environment
 * We can multiply this file to create stg.ts, production.ts and each can have its own prefer stack(s)
 * For ex: only dev.ts and stg have non-production stack
 */

import {
    Stage,
    StageProps,
  } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { resolveConfig } from '../parameters/env-config';
import { commonConstants } from '../parameters/constants';
//Import stack(s)
import { BaseNetworkStack } from '../stacks/base-network';
import { StatefulResourceStack } from '../stacks/stateful-resources';
import { StatelessResourceStack } from '../stacks/stateless-resources';

interface ProductionStageProps extends StageProps {

}

export class ProductionStage extends Stage {
	constructor(scope: Construct, id: string, props: ProductionStageProps){
		super(scope, id, props)

		//Stage prefix
		const deployEnv = "prod";

		// Load config from .env.${deployEnv} files
		const config = resolveConfig(deployEnv);

		// Some parameter might need user to define, in that case uncomment below code
		if (!config.domainName) {
			throw new Error(`Missing required DOMAIN_NAME in .env file, please include it in .env.${deployEnv} file.` );
		}
        
		const baseNetworkStack = new BaseNetworkStack(this, 'BaseNetwork', {
			stackName: `${deployEnv}-BaseNetwork-${commonConstants.project}`,
			deployEnv: deployEnv,
			config,
            terminationProtection: true // Production protection 
		});

		const statefulResourceStack = new StatefulResourceStack(this, 'StatefulResource', {
			stackName: `${deployEnv}-StatefulResource-${commonConstants.project}`,
			deployEnv: deployEnv,
			vpc: baseNetworkStack.vpc, //reference resource from difference stack can make stack interlock, so be careful!
            terminationProtection: true // Production protection 
		});
		statefulResourceStack.addDependency(baseNetworkStack);

		const statelessResourceStack = new StatelessResourceStack(this, 'StatelessResource', {
			stackName: `${deployEnv}-StatelessResource-${commonConstants.project}`,
			deployEnv: deployEnv,
			vpc: baseNetworkStack.vpc,
			hostZone: baseNetworkStack.hostZone,
			config: config,
            terminationProtection: true // Production protection 
		});
		statelessResourceStack.addDependency(baseNetworkStack);
    }
}