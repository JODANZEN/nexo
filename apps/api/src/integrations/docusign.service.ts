import { Injectable, Logger } from '@nestjs/common';

/**
 * DocuSign eSignature — skeleton pending City U setup. Real integration needs
 * JWT Grant (service user + RSA key + one-time admin consent), lease templates
 * per room type, and a go-live review (20+ sandbox calls). Flow:
 *   send lease/entry-authorization → POST /v2.1/accounts/{id}/envelopes (templateId)
 *   embedded signing → POST /envelopes/{id}/views/recipient
 *   status → Connect webhooks.
 * Docs: https://developers.docusign.com/docs/esign-rest-api/
 */
@Injectable()
export class DocusignService {
  private readonly logger = new Logger(DocusignService.name);

  get configured(): boolean {
    return !!(
      process.env.DOCUSIGN_INTEGRATION_KEY &&
      process.env.DOCUSIGN_USER_ID &&
      process.env.DOCUSIGN_RSA_PRIVATE_KEY
    );
  }

  // TODO(discovery): JWT-grant auth + sendEnvelopeFromTemplate(templateId, signer)
  // + recipientView(envelopeId) for embedded signing. Blocked on client account,
  // RSA key, and template setup.
  async sendLease(): Promise<{ status: 'not_configured' }> {
    if (!this.configured) {
      this.logger.debug('DocuSign not configured — sendLease is a no-op');
    }
    return { status: 'not_configured' };
  }
}
