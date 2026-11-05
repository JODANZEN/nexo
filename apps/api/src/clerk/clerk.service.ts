import { Injectable } from '@nestjs/common';
import { createClerkClient, type ClerkClient } from '@clerk/backend';

/** Thin wrapper over the Clerk Backend API (publicMetadata + user lookup). */
@Injectable()
export class ClerkService {
  private readonly client: ClerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY ?? '',
  });

  async setPublicMetadata(
    clerkUserId: string,
    publicMetadata: Record<string, unknown>,
  ): Promise<void> {
    await this.client.users.updateUserMetadata(clerkUserId, { publicMetadata });
  }

  // The phone Clerk verified via SMS OTP — trusted for matching invites.
  async getPrimaryPhone(clerkUserId: string): Promise<string | null> {
    const u = await this.client.users.getUser(clerkUserId);
    const primary = u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId) ?? u.phoneNumbers[0];
    return primary?.phoneNumber ?? null;
  }
}
