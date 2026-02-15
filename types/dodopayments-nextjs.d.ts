declare module "@dodopayments/nextjs" {
  export function Webhooks(config: {
    webhookKey: string;
    onPayload: (payload: any) => Promise<void>;
  }): (req: any) => Promise<any>;
}
