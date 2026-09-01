export function isEeBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["SEAN_EE"] === "1";
}

export function assertEntitlement(plan: string, feature: string): void {
  throw new Error(`ee: plan ${plan} is not entitled to ${feature}`);
}
