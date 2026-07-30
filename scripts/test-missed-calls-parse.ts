import assert from "node:assert/strict";
import {
  classifyCallType,
  formatPhoneDisplay,
  isVonageRelatedEmail,
  parseVonageEmail
} from "../lib/missed-calls/parse-vonage-email";

// Vonage Business visual voicemail
{
  const parsed = parseVonageEmail({
    from: "Vonage <voicemail@vonagebusiness.com>",
    subject: "New Voicemail from (310) 555-0199",
    text: [
      "You have a new voicemail.",
      "From: (310) 555-0199",
      "To: (424) 555-0100",
      "Listen: https://media.vonagebusiness.com/voicemail/abc123.wav"
    ].join("\n")
  });
  assert.equal(parsed.isVonageCallEmail, true);
  assert.equal(parsed.callType, "voicemail");
  assert.equal(parsed.fromNumber, "+13105550199");
  assert.equal(parsed.toNumber, "+14245550100");
  assert.ok(parsed.voicemailUrl?.includes("vonagebusiness.com"));
}

// Missed call notification
{
  const parsed = parseVonageEmail({
    from: "noreply@vonage.com",
    subject: "Missed call from 2135550188",
    text: "You missed a call from 213-555-0188 at 2:14 PM."
  });
  assert.equal(parsed.isVonageCallEmail, true);
  assert.equal(parsed.callType, "missed_call");
  assert.equal(parsed.fromNumber, "+12135550188");
}

// Unrelated email rejected
{
  assert.equal(
    isVonageRelatedEmail({
      from: "news@example.com",
      subject: "Weekly digest",
      text: "Nothing about phones"
    }),
    false
  );
}

assert.equal(classifyCallType("Voicemail left", "Caller left you a message"), "voicemail");
assert.equal(formatPhoneDisplay("+13105550199"), "(310) 555-0199");
assert.equal(formatPhoneDisplay(null), "Unknown caller");

console.log("test-missed-calls-parse: ok");
