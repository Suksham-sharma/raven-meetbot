import type { Metadata } from "next";
import {
  CONTACT_EMAIL,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service · Raven",
  description: "The terms for using Raven's meeting assistant.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms for using Raven."
      description="Raven joins meetings, keeps what was said, and helps turn it into useful work. These terms set the ground rules for using that service."
    >
      <LegalSection title="Agreement">
        <p>
          By creating an account or using Raven, you agree to these Terms and the{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink>. If you use Raven for an
          organization, you confirm that you have authority to accept these Terms for it. If you do
          not agree, do not use Raven.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Provide accurate account information, protect your sign-in credentials, and tell us
          promptly if you believe your account has been compromised. You are responsible for the
          activity initiated through your account and for keeping connected Google accounts under
          your control.
        </p>
      </LegalSection>

      <LegalSection title="Recording and consent are your responsibility">
        <p>
          Raven joins Google Meet as a visible participant. You are responsible for deciding which
          meetings Raven may join and for giving notices and obtaining permissions or consent from
          participants when required by law, contract, workplace policy, or professional duty. Do
          not use Raven to record a meeting when recording is prohibited or when you lack authority
          to do so.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You retain ownership of recordings, transcripts, files, prompts, and other material you
          submit to Raven. You grant Raven a limited, non-exclusive license to host, copy, process,
          transmit, and create derived material from that content only as needed to operate,
          protect, and improve Raven&rsquo;s user-facing features.
        </p>
        <p>
          You confirm that you have the rights needed to provide that content and instruct Raven to
          process it. Raven does not claim ownership of your meeting content.
        </p>
      </LegalSection>

      <LegalSection title="Google and other integrations">
        <p>
          Google sign-in and Calendar access are governed by your relationship with Google. You can
          disconnect Calendar in Raven or remove Raven from your Google Account. Third-party
          integrations may have their own terms and privacy policies, and Raven is not responsible
          for services it does not control.
        </p>
      </LegalSection>

      <LegalSection title="Automated output and actions">
        <p>
          Transcripts, summaries, answers, decisions, follow-ups, and proposed actions are generated
          from imperfect recordings and automated systems. They may be incomplete or wrong. Review
          important output before relying on it. Raven presents external actions for approval, but
          you remain responsible for anything you approve and send.
        </p>
        <p>
          Raven is not a substitute for legal, medical, financial, employment, or other professional
          advice and should not be used as the sole record for a decision where an error could cause
          significant harm.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Do not use Raven to:</p>
        <LegalList>
          <li>break the law, violate another person&rsquo;s rights, or record without required consent;</li>
          <li>upload malware, probe security, evade limits, or interfere with the service;</li>
          <li>access another person&rsquo;s account or meetings without authorization;</li>
          <li>harass, deceive, surveil, discriminate against, or cause harm to another person;</li>
          <li>resell or reverse engineer Raven except where the law expressly permits it; or</li>
          <li>use automated means to place unreasonable load on Raven or its providers.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Plans, limits, and changes">
        <p>
          Raven may offer free usage, paid plans, or account-specific allowances. Current limits are
          shown in the product. We may change features or limits, introduce charges with advance
          notice, or stop offering part of the service. A paid plan will disclose its price and
          billing terms before you purchase it.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          Raven is an evolving service. Meetings can fail to admit the bot, networks can drop audio,
          and integrations can change. We work to keep Raven available but do not guarantee that it
          will be uninterrupted, error-free, or suitable as your only copy of important information.
          Keep independent records where necessary.
        </p>
      </LegalSection>

      <LegalSection title="Suspension and termination">
        <p>
          You may stop using Raven at any time and may request account deletion as described in the
          Privacy Policy. We may suspend or terminate access when reasonably necessary to address a
          Terms violation, legal requirement, security risk, abuse, non-payment, or material harm to
          Raven or others. Where practical, we will provide notice and a chance to export or delete
          your content.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers and liability">
        <p>
          To the extent permitted by law, Raven is provided &ldquo;as is&rdquo; and without implied
          warranties of merchantability, fitness for a particular purpose, non-infringement, or
          uninterrupted availability.
        </p>
        <p>
          To the extent permitted by law, Raven and its operator will not be liable for indirect,
          incidental, special, consequential, or punitive damages, lost profits, lost data, or lost
          opportunities. Raven&rsquo;s total liability arising from the service will not exceed the
          amount you paid Raven during the 12 months before the event giving rise to the claim.
          Nothing here limits liability that cannot legally be limited.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these Terms">
        <p>
          We may update these Terms as Raven changes. We will update the effective date and provide
          additional notice for material changes. Continuing to use Raven after the new Terms take
          effect means you accept them.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these Terms can be sent to{" "}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
