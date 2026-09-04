import type { Metadata } from "next";
import {
  CONTACT_EMAIL,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Raven",
  description: "How Raven accesses, uses, stores, shares, and deletes your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy, in plain language."
      description="Raven is built to remember your meetings for you—not to build an advertising profile about you. This policy explains what enters Raven, why it is there, and how you can remove it."
    >
      <LegalSection title="The short version">
        <LegalList>
          <li>Raven uses your Google identity to sign you in.</li>
          <li>
            If you connect Google Calendar, Raven reads upcoming event details so it knows which
            Google Meet calls to join. It never creates, changes, or deletes calendar events.
          </li>
          <li>
            Raven records only after joining the call as a visible participant. Your meetings and
            everything produced from them belong to your account.
          </li>
          <li>We do not sell your personal data or meeting content, and we do not use it for ads.</li>
          <li>You can delete a meeting and its recording, transcript, and notes from Raven.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Information Raven receives">
        <p>
          <strong className="font-medium text-ink-1">Sign-in identity.</strong> When you continue
          with Google, Raven receives your Google account identifier, verified email address, and
          display name. If you create an email-and-password account, Raven stores your email,
          optional name, and a one-way password hash—not your password itself.
        </p>
        <p>
          <strong className="font-medium text-ink-1">Google Calendar.</strong> Calendar access is
          optional and separate from sign-in. When connected in automatic mode, Raven checks the
          next 48 hours of your primary calendar. It uses an event&rsquo;s identifier, status,
          title, start and end time, Google Meet link, and whether you declined it. Raven uses this
          only to show upcoming Meet calls and schedule the visible Raven participant. It does not
          write to your calendar, invite people, or send reminders.
        </p>
        <p>
          <strong className="font-medium text-ink-1">Meeting content.</strong> For meetings you
          add, Raven may process the audio and video recording, participant names, speaker timing,
          transcript, and the notes, decisions, follow-ups, and answers derived from that material.
          Raven also stores titles or files you provide and questions you ask about your meetings.
        </p>
        <p>
          <strong className="font-medium text-ink-1">Service information.</strong> Raven and its
          hosting providers may receive ordinary operational information such as request times, IP
          addresses, browser details, errors, and usage counts needed to run and secure the service.
        </p>
      </LegalSection>

      <LegalSection title="How Raven uses it">
        <LegalList>
          <li>Authenticate your account and keep each account&rsquo;s meetings separate.</li>
          <li>Find upcoming Meet calls and join according to the calendar mode you choose.</li>
          <li>Record, transcribe, summarize, search, and answer questions about your meetings.</li>
          <li>Draft follow-up work for your review. Raven does not send an external action without your approval.</li>
          <li>Operate, protect, debug, and improve the user-facing Raven service.</li>
          <li>Enforce meeting allowances, prevent abuse, and understand service cost.</li>
        </LegalList>
        <p>
          Raven does not sell or rent Google user data, personal data, recordings, transcripts, or
          derived meeting content. Raven does not use them for advertising or to build advertising
          profiles. Raven does not use your Google user data or meeting content to train a
          general-purpose AI model.
        </p>
      </LegalSection>

      <LegalSection title="Service providers and sharing">
        <p>
          Raven shares data only when needed to provide the service, protect it, comply with law,
          or complete a transaction involving the service. Providers process data on Raven&rsquo;s
          behalf and are not permitted to use it for their own advertising.
        </p>
        <LegalList>
          <li>Google provides sign-in, Calendar, and Meet.</li>
          <li>Deepgram receives meeting audio for transcription and speaker processing.</li>
          <li>
            OpenAI receives transcript excerpts, meeting text, and your questions when needed to
            produce summaries, structured notes, answers, and proposed follow-ups.
          </li>
          <li>
            Infrastructure providers store and deliver encrypted credentials, account records,
            recordings, transcripts, and application data.
          </li>
        </LegalList>
        <p>
          Raven may disclose information when legally required or when reasonably necessary to
          prevent fraud, abuse, security incidents, or harm. If Raven is reorganized or transferred,
          data may transfer with the service subject to this policy or notice to you.
        </p>
      </LegalSection>

      <LegalSection title="Google API Limited Use">
        <p>
          Raven&rsquo;s use and transfer to any other app of information received from Google APIs
          will adhere to the{" "}
          <LegalLink href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </LegalLink>
          , including the Limited Use requirements. Google data is used only to provide or improve
          the prominent user-facing features described above. Humans do not read Google user data
          unless you give permission, it is necessary for security or abuse investigation, it is
          required by law, or the data has been aggregated and anonymized for internal operations.
        </p>
      </LegalSection>

      <LegalSection title="Storage and security">
        <p>
          Raven separates meetings by account. Google Calendar refresh tokens are encrypted before
          they are stored. Access tokens are used to contact Google and are not kept as your
          long-term credential. Raven uses reasonable technical and organizational safeguards, but
          no online service can promise perfect security.
        </p>
        <p>
          Data may be processed where Raven&rsquo;s providers operate. By using Raven, you understand
          that those locations may have data-protection rules different from where you live.
        </p>
      </LegalSection>

      <LegalSection title="Retention, disconnection, and deletion">
        <p>
          Raven keeps account and meeting data while your account is active so the archive remains
          useful. Delete a meeting from its menu and Raven deletes the meeting record and its stored
          recording, transcript, speaker data, poster, notes, decisions, and follow-ups.
        </p>
        <p>
          Disconnect Google Calendar from Settings → Integrations to stop future calendar checks,
          revoke Raven&rsquo;s stored Calendar connection, and cancel scheduled joins. You can also
          remove Raven from your Google Account&rsquo;s third-party connections.
        </p>
        <p>
          To delete your account and the data tied to it, email{" "}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink> from the address
          on your Raven account. We may retain limited information where required for security,
          legal compliance, dispute resolution, or short-lived backups, then delete or anonymize it.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          Calendar connection is optional. You can use manual meeting joins without it, change
          automatic joining to manual mode, disconnect Calendar, delete individual meetings, or ask
          for account deletion. You may also have privacy rights under local law, including rights
          to access, correct, export, object to, or delete personal data. Contact us to exercise
          them.
        </p>
      </LegalSection>

      <LegalSection title="Children and changes">
        <p>Raven is not directed to children under 13, and we do not knowingly collect their personal data.</p>
        <p>
          We may update this policy when Raven or the law changes. We will update the effective date
          and provide additional notice when a change materially affects how we use your data.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions, privacy requests, and deletion requests can be sent to{" "}
          <LegalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
