export const stages = ["develop", "staging", "production"] as const;
export type StageName = (typeof stages)[number];
export class Config {
	public readonly stage: StageName;

	constructor(stage: StageName) {
		this.stage = stage;
	}

	genId() {
		return ["NextJs", this.stage].join("-");
	}
}
