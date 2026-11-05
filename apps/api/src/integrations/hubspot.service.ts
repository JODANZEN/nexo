import { Injectable, Logger } from '@nestjs/common';

/**
 * One-way sync of residents into HubSpot as Contacts (CRM). Private-app token.
 * Graceful no-op until HUBSPOT_TOKEN is set. v1 = create-with-409-tolerance
 * (an existing contact by email is fine); upgrade to search+update when City U
 * confirms which fields sales owns.
 */
@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  get configured(): boolean {
    return !!process.env.HUBSPOT_TOKEN;
  }

  async upsertContact(input: {
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<void> {
    if (!this.configured) return;
    const properties: Record<string, string> = {};
    if (input.email) properties.email = input.email;
    if (input.phone) properties.phone = input.phone;
    if (input.firstName) properties.firstname = input.firstName;
    if (input.lastName) properties.lastname = input.lastName;
    if (!properties.email && !properties.phone) return; // nothing to key on

    try {
      const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_TOKEN!}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });
      if (!res.ok && res.status !== 409) {
        this.logger.warn(`HubSpot upsert failed (${res.status})`);
      }
    } catch (err) {
      this.logger.warn(`HubSpot error: ${String(err)}`);
    }
  }
}
