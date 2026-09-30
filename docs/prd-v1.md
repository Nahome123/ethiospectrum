# Ethiospectrum Engineering-Ready Product Requirements Document

**Version:** 1.0 Final
**Date:** September 29, 2026
**Status:** Final Engineering Requirements
**Stakeholder:** Yamrot Bekele
**Product:** Ethiospectrum Household Service Platform

> Condensed from the stakeholder-approved document without changing any decision. It is the single
> implementation source of truth for the launch. The implementation mapping is in
> [demo-reconciliation.md](demo-reconciliation.md) and the README section "PRD v1.0 launch implementation".

---

## 1. Product Overview

Ethiospectrum is a multilingual household service platform focused on supporting parents and families of children with special needs.

The platform will provide three primary services:

1. **RBT Boot Camp**
2. **Consultation**
3. **IEP Language Assistance**

The platform will support household accounts, caregiver accounts, dependents, RBT training, training progress, service requests, specialist assignment, appointment scheduling, payments, subscriptions, IEP document handling, multilingual service delivery, and administrative management.

Ethiospectrum has **not yet been deployed to customers**. There are no existing customers, subscriptions, appointments, documents, or customer records that require migration.

The development team has an existing demo application containing some functionality. The demo is the technical starting point, but it is not automatically the product specification. Existing functionality must be classified as **Keep, Adapt, Retire, or New** according to this PRD.

The stakeholder questionnaire confirms approval of the product direction, payment model, roles and permissions, service workflows, demo review, and readiness for engineering implementation.

## 2. Product Goals

The system must:

- Provide a household-centered account structure.
- Allow parents/caregivers to access RBT educational content.
- Help parents understand neurodivergency.
- Provide preparation for an external RBT-related credential/exam.
- Provide paid consultations.
- Provide paid IEP language assistance.
- Support remote and in-person IEP assistance.
- Support English ↔ Amharic services.
- Support English ↔ Spanish services.
- Allow administrators to review and assign service requests.
- Allow specialists to fulfill assigned services.
- Support appointment scheduling and confirmation.
- Support recurring RBT subscriptions.
- Support one-time Consultation payments.
- Support one-time IEP Language Assistance payments.
- Allow Consultation and IEP Language Assistance to be purchased independently of the RBT subscription.
- Maintain separation between household, specialist, and administrative data.
- Provide a clear customer experience from service selection through service completion.

## 3. Product Decisions Filled Using Common-Sense Launch Defaults

| Question                           | Final Decision                                             |
| ---------------------------------- | ---------------------------------------------------------- |
| RBT resources without subscription | None                                                       |
| IEP session length                 | 60 minutes                                                 |
| Appointment confirmation           | Household Owner                                            |
| Training content manager           | Admin                                                      |
| Refund policy                      | Timing-based refund schedule defined below                 |
| Additional travel fee              | No automatic travel fee at launch                          |
| Taxes                              | Applicable taxes may be added where required               |
| Additional service fees            | Only when explicitly disclosed and accepted before payment |

These decisions are intended to remove ambiguity for engineering and can be changed later through a product change request.

## 4. Non-Goals

- Migrating existing customers, historical subscriptions, existing appointments, or customer documents.
- Preserving historical production data.
- Supporting multiple equal household owners.
- Allowing unlimited caregiver accounts.
- Automatically granting training access without an active subscription.
- Treating completion of the Ethiospectrum course as an RBT certification.
- Automatically representing Ethiospectrum as an accredited RBT credential provider.
- Automatically charging travel fees.
- Building features solely because they exist in the development demo.

## 5. Users and Roles

### 5.1 Household Owner

The Household Owner is the primary customer. Each household has exactly one Household Owner, who can manage the household, add and manage dependents, add one additional caregiver, purchase the RBT subscription, access RBT training with an active subscription, track training progress, purchase Consultation and IEP Language Assistance, submit service requests, upload relevant documents, select service preferences, pay for services, confirm and reschedule appointments, and view service history.

### 5.2 Additional Caregiver

Each household may have **one additional caregiver account**. The caregiver may perform household actions according to permissions granted by the Household Owner. At launch, the caregiver should have access to dependents, service requests, appointments, training, and relevant household information. The Household Owner remains the primary account holder.

### 5.3 Dependent

Dependents are associated with a household and do not require independent login accounts. The system must store name, service needs, and additional service-delivery information. Training progress may be associated with individual dependents/learners.

### 5.4 Administrator

Administrators review service requests and relevant household information, assign specialists, schedule and modify appointments, manage service statuses, manage payments, process refunds, manage training content, service configuration, and specialist capabilities, view operational dashboards, and manage customer support issues.

### 5.5 Specialist

Specialists view assigned service requests, required household/dependent information, and authorized documents; communicate with customers; conduct consultations; provide IEP language assistance; participate in school/IEP meetings; record service completion; and manage assigned follow-ups. Specialists must not have unrestricted access to unrelated household information.

## 6. Roles and Permissions

| Capability                | Household Owner |  Caregiver |        Specialist | Admin |
| ------------------------- | --------------: | ---------: | ----------------: | ----: |
| Manage household          |             Yes |    Limited |                No |   Yes |
| Manage dependents         |             Yes |        Yes |                No |   Yes |
| Purchase RBT subscription |             Yes | Authorized |                No |   Yes |
| Access RBT training       |             Yes | Authorized |                No |   Yes |
| Track training progress   |             Yes | Authorized |                No |   Yes |
| Purchase Consultation     |             Yes | Authorized |                No |   Yes |
| Purchase IEP Assistance   |             Yes | Authorized |                No |   Yes |
| Submit service request    |             Yes | Authorized |                No |   Yes |
| Upload service documents  |             Yes | Authorized |                No |   Yes |
| View assigned service     |              No |         No |               Yes |   Yes |
| Assign specialist         |              No |         No |                No |   Yes |
| Propose appointment       |              No |         No | Yes, if requested |   Yes |
| Confirm appointment       |             Yes | Authorized |                No |   Yes |
| Schedule directly         |              No |         No |                No |   Yes |
| Complete service          |              No |         No |               Yes |   Yes |
| Manage training content   |              No |         No |                No |   Yes |
| Process refunds           |              No |         No |                No |   Yes |

## 7. RBT Boot Camp

RBT Boot Camp is a **self-paced video library** whose primary intended learner is the parent of a child with special needs. It helps parents understand neurodivergency, complete the Ethiospectrum curriculum, and prepare for an external RBT-related credential/exam. Ethiospectrum must not represent completion of its course as automatic external RBT certification.

## 8. RBT Subscription

RBT Boot Camp requires a **monthly recurring subscription** that unlocks all training videos, supporting resources, and all approved training content/resources.

## 9. RBT Access Without Subscription

**No RBT training resources are available without an active subscription.** The public website may contain general marketing information, but protected training content and resources require an active subscription.

## 10. Training Progress

Training progress must support both Household Owner/learner-level progress and individual dependent/learner-level progress, tracking course, module, lesson, learner, completion status, progress percentage, start timestamp, and completion timestamp.

## 11. Consultation

Consultation provides general household/service guidance and specific behavioral/educational guidance (administrators may configure eligible topics). **$9.99** per consultation, **60 minutes**, one follow-up included (the system tracks whether the original consultation occurred and whether the follow-up has been scheduled and completed). Customers may cancel or reschedule without penalty at least **48 hours** before the appointment; refund rules are in section 26.

## 12. IEP Language Assistance

Scope: explaining/understanding an IEP and language assistance during a school meeting. Launch languages: English ↔ Amharic and English ↔ Spanish, designed so additional languages can be added later. **$19.99** per service, **60-minute** sessions. Preparation is not included as a separately guaranteed service. One follow-up is included. Written translation is included and tracked as a distinct service activity within the request.

## 13. In-Person Delivery

IEP Language Assistance supports in-person delivery at the Ethiospectrum location, the school/IEP meeting, or a mutually agreed location.

## 14. Travel Policy

**The customer will not automatically be charged a travel fee at launch.** The application must not automatically add a travel charge to an appointment. Customer-paid travel fees require a separate product decision.

## 15. Appointment Instructions

The system supports both standard instructions (for example "Please arrive 10 minutes before your scheduled appointment.") and appointment-specific instructions (for example "Please check in at the school's main office upon arrival.").

## 16. Household Structure

Each household contains one Household Owner, zero or one additional caregiver, one or more dependents, service requests, appointments, payments, subscriptions, training progress, and documents.

## 17. Dependent Information

Each dependent supports name, service needs, and additional service-delivery information (communication considerations, preferred language, relevant educational information, relevant behavioral/service information). Only information necessary for service delivery should be collected.

## 18. Service Request Architecture

All paid services use a common service-request architecture that separately tracks service type, customer, household, dependent, specialist, payment status, appointment status, service status, and completion status. Payment status must not be combined with service status.

## 19. Consultation Workflow

1. Service selection. 2. Request (dependent, description of need, relevant service information, preferred language). 3. Admin review. 4. Specialist assignment. 5. Admin proposes appointment times. 6. Customer pays $9.99. 7. Household Owner confirms. 8. Specialist conducts the 60-minute consultation. 9. One included follow-up if needed. 10. Specialist or Admin marks the service complete.

## 20. IEP Language Assistance Workflow

1. Request (dependent, language, remote/in-person preference, requested service, relevant IEP information, documents). 2. Admin review. 3. Specialist assignment based on service, language, availability, and delivery method. 4. Admin proposes appointment times. 5. Customer pays $19.99. 6. Household Owner confirms. 7. Specialist provides the service. 8. One follow-up is available. 9. Specialist or Admin marks the service complete.

## 21. Appointment Management

Appointments support service request, household, dependent, specialist, date, start and end time, location, remote/in-person status, appointment status, customer confirmation, cancellation, rescheduling, and completion. The **Admin** proposes appointment times; the **Household Owner confirms**; the Admin may also directly schedule appointments when necessary.

## 22. Service Completion

Either the Specialist or the Admin may mark a service as completed, recording who completed it, the date/time, the service status, and any required completion notes.

## 23. Service Status Model

Pending Review → Assigned → Awaiting Availability → Awaiting Payment → Appointment Proposed → Appointment Confirmed → In Progress → Completed. Alternative states: Payment Failed, Cancelled, Reschedule Requested, Declined, No-Show. Payment status remains separate.

## 24. Payment Model

RBT: monthly recurring subscription. Consultation: $9.99 one-time. IEP Language Assistance: $19.99 one-time. Consultation and IEP Language Assistance may be purchased without an RBT subscription.

## 25. Payment Failure

Keep the service request pending, notify the customer, do not confirm the appointment as paid, allow payment retry, and preserve the service request rather than creating a duplicate.

## 26. Final Cancellation and Refund Policy

- **More than 48 hours before:** cancel for a 100% refund, or reschedule without an additional service charge.
- **24 to 48 hours before:** cancel for a 50% refund, or reschedule once without an additional service charge.
- **Less than 24 hours before:** reschedule once without purchasing the service again. No cash refund unless an administrator approves an exception.
- **No-show:** no automatic refund; rescheduling may be approved by an Admin case by case.
- **Administrative cancellation:** if Ethiospectrum cancels for reasons unrelated to the customer, the customer receives a 100% refund or may choose to reschedule.

## 27. Refund Data

Every refund records the original payment amount, refund amount, refund date, refund reason, payment provider refund ID, service request ID, customer ID, and who processed it.

## 28. Taxes and Additional Fees

Applicable taxes may be charged where required, calculated by the payment provider or an approved tax system. Base prices remain Consultation $9.99 and IEP Language Assistance $19.99. No automatic travel fee. Any future additional service fee must be configured by an authorized administrator, clearly displayed before payment, included in the payment total, and accepted by the customer before payment.

## 29. Payment States

Pending, Processing, Paid, Failed, Partially Refunded, Refunded. A service is not considered paid until the payment provider confirms successful payment.

## 30. Database Requirements

User, Household, HouseholdMember, Dependent, Service (types `RBT_BOOTCAMP`, `CONSULTATION`, `IEP_LANGUAGE_ASSISTANCE`), ServiceRequest, Appointment, Payment, Subscription, TrainingCourse, TrainingModule, TrainingLesson, TrainingProgress (learner type and id, lesson, percentage, completed, timestamps), and SpecialistCapability (specialist, service type, language, delivery method). Roles: ADMIN, SPECIALIST, HOUSEHOLD_OWNER, CAREGIVER.

## 31. Document Requirements

IEP, educational, and service-related documents are associated with the household, dependent, and service request. Specialists may only access documents required for their assigned service. Document authorization is enforced server-side.

## 32. Customer Dashboard

Active RBT subscription, training progress, available services, upcoming appointments, pending payments, service requests, dependents, and recent service history.

## 33. Service Selection

RBT Boot Camp (monthly subscription; all protected RBT training content and resources), Consultation ($9.99, one-time, 60 minutes), and IEP Language Assistance ($19.99, one-time, 60-minute session, English ↔ Amharic and English ↔ Spanish). The UI must clearly state that Consultation and IEP Language Assistance do not require an RBT subscription.

## 34. Consultation Request Form

Dependent, description of need, service category, relevant information, and preferred language where applicable.

## 35. IEP Request Form

Dependent, language, service type, remote/in-person preference, requested meeting date if applicable, relevant IEP information, and document upload where applicable.

## 36. Appointment UI

Service, specialist, date, time, duration, location, delivery method, confirmation status, cancellation policy, and rescheduling option.

## 37. Admin Dashboard

A service work queue showing new requests, requests awaiting assignment, assigned requests, requests awaiting payment, appointment proposals, upcoming appointments, completed services, failed payments, refund requests, cancellation requests, and rescheduling requests. Admins can assign specialists, propose, schedule, and modify appointments, review requests, manage service status, process refunds, and manage training content and service configuration.

## 38. Training Content Management

Admins create courses, modules, and lessons, upload/link videos, add resources, reorder lessons, publish/unpublish, edit descriptions, and archive content. Content changes should not delete historical learner progress unless explicitly intended.

## 39. Specialist Dashboard

Assigned services, upcoming appointments, customer/dependent information needed for the service, authorized documents, language requirements, service status, and follow-up requirements.

## 40. Notifications

- **Customer:** account creation, subscription purchase, payment confirmation, payment failure, service request received, specialist assignment, appointment proposed, appointment confirmation, appointment reminder, appointment cancellation, rescheduling, refund, service completion, follow-up availability.
- **Specialist:** new assignment, appointment proposal, appointment confirmation, rescheduling, cancellation, document availability, follow-up requirement.
- **Admin:** new service request, failed payment, cancellation, rescheduling request, unassigned request, service completion, refund request.

## 41. Security Requirements

All permissions are enforced server-side (frontend permissions alone are not sufficient). Household users access only their own household data. Specialists access only information associated with assigned service requests. Documents require authenticated, server-side-authorized access and are never public. The application must not store raw credit-card information.

## 42. Demo Application Review

Every existing demo feature is classified KEEP, ADAPT, RETIRE, or NEW. The demo is not a source of additional requirements. See [demo-reconciliation.md](demo-reconciliation.md).

## 43. Acceptance Criteria

Account management, RBT, Consultation, IEP Language Assistance, payments, and scheduling criteria as listed in the stakeholder document: registration creates exactly one household with one owner; one caregiver; dependents without logins; household isolation; recurring monthly RBT subscription with content locked without it; self-paced videos and resources; owner and dependent progress; admin content management; no certification claim; independently purchasable $9.99/60-minute Consultation and $19.99/60-minute IEP Language Assistance in English ↔ Amharic and English ↔ Spanish with explanation, meeting assistance, written translation, one follow-up, remote and in-person delivery at all approved locations and no travel fee; admin review, assignment, proposals, owner confirmation, direct scheduling; enforced cancellation/refund rules; recurring vs one-time billing; failed payments left pending with notification and retry; provider confirmation before appointment confirmation; taxes where applicable; fee disclosure and acceptance; and appointment status separate from payment status.

## 44. Engineering Priorities

Phase 1 Foundation · Phase 2 RBT · Phase 3 Consultation · Phase 4 IEP · Phase 5 Operations · Phase 6 Demo Reconciliation.

## 45. Definition of Done

Household and caregiver accounts, dependent management, server-side RBAC, RBT subscriptions and subscription-protected content, training progress, admin training content management, independently purchasable Consultation and IEP Language Assistance, specialist assignment with language-based matching, appointment proposals, owner confirmation, admin direct scheduling, remote and in-person workflows, payments and payment-failure handling, refund rules, rescheduling, taxes where required, no automatic travel fee, explicit fee disclosure, notifications, secure document storage and access, household isolation, specialist-scoped access, admin operations, and a completed demo review with no unapproved demo-only functionality exposed.

## 46. Final Product Decisions

- **RBT:** self-paced video library; monthly subscription; all content included; nothing protected without a subscription; owner and learner/dependent progress; curriculum completion and external credential preparation; admin-managed content.
- **Consultation:** $9.99; 60 minutes; general and behavioral/educational guidance; one follow-up; 48-hour cancellation threshold; timing-based refunds.
- **IEP Language Assistance:** $19.99; 60 minutes; English ↔ Amharic and English ↔ Spanish; IEP explanation; school-meeting language assistance; written translation; one follow-up; remote and in person; no automatic travel fee.
- **Household:** one owner; one additional caregiver; multiple dependents.
- **Scheduling:** admin proposes; household owner confirms; admin can schedule directly; specialist or admin completes.
- **Payments:** RBT recurring; Consultation and IEP one-time; independent purchases; failed payments remain pending with notification; timing-based refunds; rescheduling; taxes where required; no automatic travel fee; fees disclosed and accepted.

## 47. Stakeholder Approval

The completed stakeholder questionnaire indicates approval of the product direction, payment model, user roles and permissions, service workflows, demo/current implementation review, and readiness for engineering implementation.

**Stakeholder:** Yamrot Bekele · **Date:** September 29, 2026
