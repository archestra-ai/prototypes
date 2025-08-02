// implementation of the security schemes in the openapi specification

export class Security {
	async initialize(schemes) {
		// schemes will contain securitySchemes as found in the openapi specification
		console.log("Initialize:", JSON.stringify(schemes));
	}

}
