import { describe, expect, it } from "vitest";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const integration = apiKey ? describe : describe.skip;

describe("Resend client configuration", () => {
  it("constructs a client when given a Resend API key", () => {
    const client = new Resend("re_test_key");
    expect(client).toBeInstanceOf(Resend);
  });
});

integration("Resend integration", () => {
  it("can send a test email with a configured API key", async () => {
    expect(apiKey).toMatch(/^re_/);

    const resend = new Resend(apiKey!);
    const response = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "delivered@resend.dev",
      subject: "Test Email",
      html: "<p>This is a test email to validate the Resend API key.</p>",
    });

    expect(response).toBeDefined();
    expect(response.data).toBeDefined();
  });
});
