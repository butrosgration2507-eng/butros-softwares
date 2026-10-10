import type { ReactNode } from 'react';
import { api, type Category } from '../api';
import { Notice, useAsync, usePageMeta } from '../components/ui';

type Settings = { siteName: string; contactEmail: string; organisationName: string; location: string };

function Page({ title, description, children }: { title: string; description: string; children: (s: Settings) => ReactNode }) {
  usePageMeta(title, description);
  const { data: s } = useAsync(() => api.get<Settings>('/api/settings'), []);
  const settings: Settings = s ?? { siteName: 'BUTROS SOFTWARES', contactEmail: '', organisationName: 'BUTROS SOFTWARES', location: '' };
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
      {s && !s.contactEmail && (
        <div className="mt-6"><Notice tone="warn" title="Draft text, not yet reviewed">This page is an initial draft. The site owner must add contact details in Admin → Settings and have the legal text reviewed before launch.</Notice></div>
      )}
      <div className="mt-8 space-y-5 leading-relaxed text-muted [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-fg [&_a]:text-accent [&_a]:underline">{children(settings)}</div>
    </div>
  );
}
const mail = (s: Settings) => s.contactEmail ? <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a> : <strong>[contact email not set]</strong>;

export function About() {
  return <Page title="About Us" description="Learn about BUTROS SOFTWARES, a software discovery and download platform.">{(s) => (<>
    <p>{s.siteName} is a software discovery and download platform. Each listing shows the version, size, supported systems and requirements so you know what you are downloading before you start.</p>
    <h2>How it works</h2>
    <p>Software is added to the catalogue by the site administrator. Files are stored on Google Drive and delivered to you directly by Google. We only list software that we are authorized to distribute.</p>
    <h2>Who runs this site</h2>
    <p>{s.organisationName}{s.location ? `, ${s.location}` : ''}. Questions? See the <a href="/contact">contact page</a>.</p>
  </>)}</Page>;
}
export function Contact() {
  return <Page title="Contact" description="Contact BUTROS SOFTWARES for support, software submissions and copyright notices.">{(s) => (<>
    <p>For support, questions about a listing, or to submit software, email {mail(s)}.</p>
    <p>To report copyright infringement, follow the steps on the <a href="/takedown">Copyright and Takedown Policy</a> page.</p>
  </>)}</Page>;
}
export function Privacy() {
  return <Page title="Privacy Policy" description="How BUTROS SOFTWARES handles visitor and administrator data.">{(s) => (<>
    <p><strong>Draft for review.</strong> This summary describes what the software actually does today. Have it checked against the laws that apply to you (for example Tanzania’s Personal Data Protection Act, and GDPR if you serve visitors in Europe).</p>
    <h2>What we collect from visitors</h2>
    <ul><li>We do not require visitors to create accounts.</li><li>When you start a download we record that a download link was issued for that software. We do not store your name, email, IP address or other personal identifiers in that record.</li><li>Our hosting provider and Google Drive may process technical data such as your IP address to deliver pages and files. See their privacy policies.</li></ul>
    <h2>Cookies</h2>
    <p>The public site does not set cookies. Administrators receive a secure session cookie when signing in.</p>
    <h2>Administrator data</h2>
    <p>Administrator email addresses, password hashes and an audit log of administrative actions are stored in our database. Google account refresh tokens are encrypted at rest.</p>
    <h2>Contact</h2>
    <p>Privacy questions: {mail(s)}.</p>
  </>)}</Page>;
}
export function Terms() {
  return <Page title="Terms of Use" description="The terms that apply when you use BUTROS SOFTWARES.">{(s) => (<>
    <p><strong>Draft for review.</strong> Have a qualified lawyer review these terms before launch.</p>
    <h2>Using the site</h2>
    <p>You may browse and download software for lawful purposes. Each program is governed by its own license, which you must read and follow.</p>
    <h2>No warranty</h2>
    <p>Software is provided “as is” without warranty of any kind. Always scan downloads with antivirus software and verify checksums when provided. To the extent permitted by law, {s.organisationName} is not liable for damage resulting from the use of downloaded software.</p>
    <h2>Availability</h2>
    <p>Files are delivered by Google Drive. Availability and download limits are controlled by Google and may change without notice.</p>
    <h2>Copyright</h2>
    <p>Rights holders can report infringement through our <a href="/takedown">takedown policy</a>.</p>
    <h2>Contact</h2><p>{mail(s)}</p>
  </>)}</Page>;
}
export function SubmissionPolicy() {
  return <Page title="Software Submission Policy" description="Rules for submitting software to BUTROS SOFTWARES.">{(s) => (<>
    <p><strong>Draft for review.</strong></p>
    <h2>What we accept</h2>
    <ul><li>Software you own or are explicitly licensed to redistribute (for example open-source software, freeware that permits redistribution, or your own products).</li><li>Original, unmodified installers, or modifications that the license allows.</li></ul>
    <h2>What we reject</h2>
    <ul><li>Cracked, pirated or license-bypassing software, key generators and activators.</li><li>Malware, adware or anything that behaves differently from its description.</li><li>Software whose license forbids redistribution.</li></ul>
    <h2>How to submit</h2>
    <p>Email {mail(s)} with the software name, publisher, version, license and an official download source. We may ask for proof of distribution rights, and we may remove listings at any time.</p>
  </>)}</Page>;
}
export function Takedown() {
  return <Page title="Copyright and Takedown Policy" description="How to report copyright infringement to BUTROS SOFTWARES.">{(s) => (<>
    <p><strong>Draft for review.</strong> Check which notice-and-takedown rules apply to you and adjust this page.</p>
    <p>We respect intellectual property rights. If you believe material on this site infringes your copyright, email {mail(s)} with:</p>
    <ul><li>Your name and contact details.</li><li>The web address of the listing.</li><li>A description of the work you own and why the listing infringes it.</li><li>A statement that you act in good faith and that your information is accurate.</li><li>Your signature (typed is fine).</li></ul>
    <p>We review complete notices promptly and may unpublish a listing while we do.</p>
  </>)}</Page>;
}
export type { Category };
