/**
 * Terms of Use and Privacy Policy text (English). Drafts for legal review:
 * bracketed values such as [LEGAL ENTITY NAME] must be completed, and the
 * dispute-resolution section in particular needs counsel's decision.
 *
 * A block is a paragraph (string) or a bulleted list (string[]).
 */
export type LegalBlock = string | string[];
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDocument = { lastUpdated: string; summary: string; sections: LegalSection[] };

const CONTACT_EMAIL = "[CONTACT EMAIL]";
const ENTITY = "[LEGAL ENTITY NAME]";
const ADDRESS = "[MAILING ADDRESS]";

export const termsOfUse: LegalDocument = {
  lastUpdated: "October 14, 2026",
  summary:
    "These Terms of Use are an agreement between you and Ethiospectrum. They explain what the service does, what you can expect from us, and what we expect from you. Please read them carefully: by creating an account or using Ethiospectrum, you agree to them.",
  sections: [
    {
      id: "emergencies",
      title: "Not for emergencies",
      blocks: [
        "Ethiospectrum is not an emergency service. Do not use messages, requests or appointments to report a medical emergency or any urgent safety concern. If you think someone may be in danger, call 911 (or your local emergency number) right away.",
      ],
    },
    {
      id: "about",
      title: "1. Who we are and what these terms cover",
      blocks: [
        `"Ethiospectrum", "we" and "us" mean ${ENTITY}. "You" means the person who uses the service. If you use Ethiospectrum on behalf of a child or another person in your care, "you" includes both you and the person you act for.`,
        "Ethiospectrum is an online service, available in English, Amharic and Spanish, that helps families supporting a neurodivergent child. It lets you:",
        [
          "keep a household account and invite caregivers with the permissions you choose;",
          "add your dependents and keep their information and documents in one place;",
          "request a consultation or IEP language assistance from an Ethiospectrum specialist, choose a time, and pay for it;",
          "subscribe to RBT Boot Camp training and track learning progress;",
          "read educational resources.",
        ],
        'Together these are the "Services". These terms apply to all of them, on any device.',
      ],
    },
    {
      id: "not-advice",
      title: "2. Educational support, not professional advice",
      blocks: [
        "Ethiospectrum provides educational, informational, language and organizational support. It does not provide medical, psychological, legal, immigration or other professional advice, diagnosis or treatment, and it does not make eligibility decisions for schools or agencies. Our specialists are not acting as your doctor, therapist or lawyer.",
        "Ethiospectrum is not a medical or health record. Check important information against the original source, and talk to a qualified professional about decisions for your child. IEP language assistance helps you understand and take part in school meetings; Ethiospectrum is not a party to your child's IEP and cannot guarantee any outcome.",
        "RBT Boot Camp is study material. Completing it does not certify you as a Registered Behavior Technician or meet any credentialing requirement by itself.",
      ],
    },
    {
      id: "privacy",
      title: "3. Privacy",
      blocks: [
        "Our Privacy Policy explains what information we collect, how we use it and who can see it. Please read it before sharing information about yourself or your child. By using the Services you agree that we may handle your information as it describes.",
      ],
    },
    {
      id: "accounts",
      title: "4. Accounts, households and security",
      blocks: [
        "You need an account to use most of the Services. Give us accurate information and keep it up to date. Keep your password private, and tell us right away at " +
          CONTACT_EMAIL +
          " if you think someone has used your account without permission. You are responsible for activity under your account.",
        "The household owner can invite caregivers and decide what each one may see and do. If you invite someone, you are responsible for choosing their permissions and for removing access they should no longer have.",
      ],
    },
    {
      id: "eligibility",
      title: "5. Who can use Ethiospectrum",
      blocks: [
        "You must be at least 18 years old and able to enter into a binding agreement to create an account. Children do not have their own accounts; a parent, guardian or authorized caregiver adds them as dependents.",
        "Only add information about a child or another person if you are their parent or legal guardian, or are otherwise allowed to share it and to make decisions about the services they receive.",
      ],
    },
    {
      id: "acceptable-use",
      title: "6. Acceptable use",
      blocks: [
        "Use the Services only for lawful purposes and as these terms allow. You agree not to:",
        [
          "share information about someone without the right to do so;",
          "upload anything unlawful, harassing, hateful, sexually explicit or that invades someone's privacy;",
          "upload viruses or other harmful code, or try to get around security or access controls;",
          "access another household's information, or try to;",
          "copy, scrape or resell the Services or the training materials;",
          "pretend to be someone else, or misstate your relationship to a child;",
          "use the Services in a way that could damage, overload or interfere with them.",
        ],
        "We may remove content or limit access when we reasonably believe these rules have been broken.",
      ],
    },
    {
      id: "your-content",
      title: "7. Your content",
      blocks: [
        'You keep ownership of the information and documents you add ("your content"). You give Ethiospectrum permission to store, process, display and share your content only as needed to provide the Services to you, for example to show a document to the specialist assigned to your request or to people in your household with access.',
        "You confirm that you have the right to share your content, that it is accurate to the best of your knowledge, and that sharing it does not break any law or anyone else's rights. We do not sell your content.",
      ],
    },
    {
      id: "ownership",
      title: "8. Our content",
      blocks: [
        "The Services, including the training materials, videos, study guides, text, design, logos and software, belong to Ethiospectrum or our licensors and are protected by law. We give you a personal, non-transferable permission to use them for your own family's learning while your account (and, for training, your subscription) is active. Do not copy, share, publish or sell them without our written permission.",
      ],
    },
    {
      id: "links",
      title: "9. Other websites",
      blocks: [
        "The Services may link to websites or services we do not control, such as a video host or a school's site. We are not responsible for their content or practices; your use of them is governed by their own terms.",
      ],
    },
    {
      id: "fees",
      title: "10. Fees, billing and payment",
      blocks: [
        "Prices are shown in the app before you pay. Payments are processed by our payment provider, Stripe; we do not store your full card number.",
        [
          "Consultations and IEP language assistance are one-time charges for each request.",
          "RBT Boot Camp is a monthly subscription. It renews automatically each month at the current price until you cancel.",
          "You can cancel the subscription at any time from Billing in the app. Cancellation takes effect at the end of the period you have already paid for, and you keep access until then. We do not give refunds or credits for part of a month, except where the law requires.",
          "Prices do not include taxes unless stated; applicable taxes are added at checkout.",
          "If a payment fails, we may pause access to paid features until it is resolved.",
        ],
        "Appointment cancellations follow the cancellation and refund policy shown when you book: more than 48 hours before the appointment you may cancel for a full refund; 24 to 48 hours before, for a 50% refund; within 24 hours there is no cash refund, but you may reschedule once. Administrators may approve exceptions.",
        "If we change a price, we will tell you before it applies to your subscription, and you can cancel before the change takes effect.",
      ],
    },
    {
      id: "communications",
      title: "11. Messages from us",
      blocks: [
        "We send in-app notifications and emails about your account, requests, appointments, payments and changes to the Services. These messages are part of providing the Services. We do not send marketing email without your permission.",
      ],
    },
    {
      id: "copyright",
      title: "12. Copyright complaints",
      blocks: [
        `If you believe something on Ethiospectrum infringes your copyright, email ${CONTACT_EMAIL} with: a description of the work; where it appears on the Services; your contact details; a statement that you believe in good faith the use is not authorized; and a statement, under penalty of perjury, that your notice is accurate and that you are the owner or authorized to act for the owner, with your physical or electronic signature. We may remove the material and, where appropriate, end the accounts of repeat infringers.`,
      ],
    },
    {
      id: "ending",
      title: "13. Ending your account",
      blocks: [
        `You may stop using the Services at any time. To close your account and have your household's information deleted, contact us at ${CONTACT_EMAIL}. Deletion is described in the Privacy Policy.`,
        "We may suspend or end your access if you break these terms, if required by law, or if we stop offering the Services. Where reasonable we will tell you first. Sections that by their nature should continue (such as ownership, disclaimers and limits of liability) continue after your account ends.",
      ],
    },
    {
      id: "changes",
      title: "14. Changes to the Services and these terms",
      blocks: [
        "We may update the Services and these terms. If a change is significant, we will tell you in the app or by email before it takes effect. If you keep using the Services after the change, you accept the updated terms; if you do not agree, you can cancel and stop using them. The date at the top shows when these terms last changed.",
      ],
    },
    {
      id: "disclaimers",
      title: "15. Disclaimers",
      blocks: [
        'We work to keep Ethiospectrum accurate, available and secure, but the Services are provided "as is" and "as available". To the extent the law allows, we make no warranties beyond those stated in these terms, including implied warranties of merchantability, fitness for a particular purpose and non-infringement, and we do not promise that the Services will be uninterrupted or error-free.',
      ],
    },
    {
      id: "liability",
      title: "16. Limits on liability",
      blocks: [
        "To the extent the law allows, Ethiospectrum is not liable for indirect, incidental, special, consequential or punitive damages, or for lost data, profits or opportunities, arising from your use of the Services. Our total liability for any claim relating to the Services is limited to the greater of the amount you paid us in the 12 months before the claim or US $100.",
        "Some places do not allow these limits, so they may not all apply to you. Nothing in these terms limits liability that cannot be limited by law.",
      ],
    },
    {
      id: "disputes",
      title: "17. Disputes and governing law",
      blocks: [
        `If you have a concern, please contact us first at ${CONTACT_EMAIL}; most issues can be resolved quickly and informally.`,
        "[TO BE COMPLETED WITH COUNSEL: governing law (state), courts or venue, and whether disputes go to individual arbitration and include a class-action or jury waiver. Do not publish this section until it has been reviewed.]",
      ],
    },
    {
      id: "general",
      title: "18. General",
      blocks: [
        "These terms, together with the Privacy Policy and any terms shown when you buy something in the app, are the whole agreement between you and Ethiospectrum about the Services. If a part of these terms cannot be enforced, the rest still applies. If we do not enforce a right, we have not given it up. You may not transfer these terms to someone else without our consent; we may transfer them as part of a reorganization or sale of the business.",
      ],
    },
    {
      id: "contact",
      title: "19. Contact",
      blocks: [`${ENTITY}`, `${ADDRESS}`, `Email: ${CONTACT_EMAIL}`],
    },
  ],
};

export const privacyPolicy: LegalDocument = {
  lastUpdated: "October 14, 2026",
  summary:
    "Families trust Ethiospectrum with information about their children. This policy explains what we collect, why, who can see it, and the choices you have. In short: we collect what we need to provide the service, we share it only with the people and providers who need it, and we never sell it.",
  sections: [
    {
      id: "who-we-are",
      title: "1. Who we are",
      blocks: [
        `Ethiospectrum is operated by ${ENTITY} ("Ethiospectrum", "we", "us"). This policy covers the Ethiospectrum website and app. Questions? Email ${CONTACT_EMAIL}.`,
      ],
    },
    {
      id: "what-we-collect",
      title: "2. Information we collect",
      blocks: [
        "Information you give us:",
        [
          "Account details: your name, email address, preferred language and, if you add it, your phone number. Your password is handled by our authentication provider and is never visible to us.",
          "Household details: the people you invite and the permissions you give them.",
          "Dependent details: your child's name, birth year, languages, service needs and other notes you choose to add.",
          "Documents you upload, such as IEPs, school letters or evaluations.",
          "Service requests: what you need help with, the times you choose, messages, and notes from your specialist.",
          "Training activity: lessons started and completed, and progress for each learner.",
          "Payments: we receive the amount, date and status of each payment from Stripe. Stripe, not Ethiospectrum, holds your card details.",
        ],
        "Information collected automatically:",
        [
          "Sign-in and security information, such as session cookies, IP address, browser type and the time of requests, used to keep you signed in and protect accounts.",
          "Your language choice, so the site shows in English, Amharic or Spanish.",
        ],
        "We do not use advertising cookies and we do not show ads.",
      ],
    },
    {
      id: "how-we-use",
      title: "3. How we use information",
      blocks: [
        [
          "to provide the Services: run your household, show your child's information to the people you allow, match and schedule specialists, and deliver training;",
          "to take payments, issue refunds and manage subscriptions;",
          "to send notifications, receipts, reminders and important notices;",
          "to keep the Services secure, prevent misuse, and fix problems;",
          "to understand, in summary form, how the Services are used so we can improve them;",
          "to meet legal obligations and enforce our Terms of Use.",
        ],
        "We do not sell personal information, and we do not use your child's information for advertising.",
      ],
    },
    {
      id: "who-can-see",
      title: "4. Who can see your information",
      blocks: [
        [
          "People in your household, according to the permissions the household owner sets.",
          "The specialist assigned to a request, who sees the information and documents attached to that request.",
          "A small number of Ethiospectrum administrators, who need access to review requests, assign specialists, handle billing and provide support. Administrative actions are logged.",
          "Service providers that run parts of Ethiospectrum for us, under contracts that limit how they use your information: Supabase (accounts, database and file storage), Vercel (website hosting), Stripe (payments) and Resend (email delivery).",
          "Authorities or others when the law requires it, to protect someone's safety, or to protect our rights, and a buyer or successor if Ethiospectrum is reorganized or sold (who must keep honouring this policy).",
        ],
      ],
    },
    {
      id: "children",
      title: "5. Children's information",
      blocks: [
        "Ethiospectrum is for parents, guardians and caregivers. Children do not create accounts; information about a child is provided by an adult who is allowed to share it. If you believe a child's information was added without permission, contact us and we will review and, where appropriate, delete it.",
      ],
    },
    {
      id: "security",
      title: "6. How we protect information",
      blocks: [
        "Information is encrypted in transit, documents are kept in private storage, and database rules limit each person to the information they are allowed to see. Staff access is limited to what their role needs. No system is perfectly secure, so please use a strong password and keep it private. If we learn of a breach that affects your information, we will notify you as the law requires.",
      ],
    },
    {
      id: "retention",
      title: "7. Keeping and deleting information",
      blocks: [
        "We keep your information while your account is open. You can edit or remove dependents and documents in the app.",
        `To delete your account and your household's information, email ${CONTACT_EMAIL}. An administrator will remove your household, its members' access, dependents, documents, requests and training progress. We keep payment records and a minimal record of the deletion where the law or legitimate business needs (such as tax and accounting) require it. Backups are overwritten on a regular cycle [CONFIRM BACKUP PERIOD].`,
      ],
    },
    {
      id: "choices",
      title: "8. Your choices and rights",
      blocks: [
        [
          "See and update your information in the app, or ask us for a copy.",
          "Correct information that is wrong.",
          "Delete information or your whole account.",
          "Cancel your subscription at any time from Billing.",
        ],
        "Depending on where you live, you may have additional rights under local privacy law. We will not treat you differently for using them. [COUNSEL TO CONFIRM which state privacy laws apply and whether any health or education privacy laws apply to the Services.]",
      ],
    },
    {
      id: "international",
      title: "9. Where information is stored",
      blocks: [
        "Ethiospectrum is operated from the United States, and our providers store information in the United States [CONFIRM HOSTING REGION]. If you use the Services from another country, including Ethiopia, your information will be transferred to and processed in the United States.",
      ],
    },
    {
      id: "changes",
      title: "10. Changes to this policy",
      blocks: [
        "If we change this policy in a significant way, we will tell you in the app or by email before the change takes effect. The date at the top shows when it was last updated.",
      ],
    },
    {
      id: "contact",
      title: "11. Contact",
      blocks: [`${ENTITY}`, `${ADDRESS}`, `Email: ${CONTACT_EMAIL}`],
    },
  ],
};
