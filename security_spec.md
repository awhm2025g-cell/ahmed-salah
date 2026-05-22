# Security Specification - Teachers Evaluation System

## 1. Data Invariants
- An evaluation cannot exist without a valid teacherId.
- Only users with roles `admin`, `supervision_director`, `school_director`, `school_vice_principal`, or `supervisor` can create evaluations.
- Users can only see/modify evaluations for their assigned stage unless they are `admin` or have `all` access.
- `totalScore` must be the sum of individual scores and cannot exceed 100.
- `createdAt` is immutable.
- A `submitted` evaluation cannot be modified (locked).

## 2. Dirty Dozen Payloads (Rejection Targets)
1. **Identity Spoofing**: Attempt to create a user profile with `uid` of another user.
2. **Privilege Escalation**: A regular supervisor attempts to change their role to `admin`.
3. **Resource Poisoning**: Use a 1MB string as a teacher `id`.
4. **Relationship Violation**: Create an evaluation for a non-existent teacher.
5. **State Shortcut**: Update an evaluation directly to `approved` status without valid signatures.
6. **Immutable Breach**: Attempt to change the `createdAt` timestamp of an evaluation.
7. **Cross-Stage Breach**: A primary school supervisor attempts to read secondary school evaluations.
8. **Field Injection**: Add a hidden `isVerified: true` field to an evaluation.
9. **Score Manipulation**: Set a criterion score higher than its `maxScore`.
10. **Shadow Delete**: A non-admin attempts to delete a teacher record.
11. **PII Leak**: An unauthenticated user attempts to read the users list.
12. **Batch Exhaustion**: Attempting to query 10,000 evaluations at once without pagination filters.

## 3. Test Runner (Draft)
A comprehensive test suite will verify these invariant blocks.
