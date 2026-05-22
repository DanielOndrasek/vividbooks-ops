import type { RmixInquiry, RmixListingStat } from './types.js';

/**
 * Lokální stub pro `MOCK_MODE=true`. Vrací deterministickou fixturu, takže
 * Edge Function jde testovat lokálně bez whitelistu / produkčních klíčů.
 */
export class MockRealitymixClient {
  async ensureLoggedIn(): Promise<void> {}

  async listStats(): Promise<RmixListingStat[]> {
    return [
      {
        advert_id: 'demo-1',
        date: new Date().toISOString().slice(0, 10),
        list_views: 12,
        detail_views: 3,
        contact_views: 1,
        inquiries: 0,
      },
      {
        advert_id: 'demo-2',
        date: new Date().toISOString().slice(0, 10),
        list_views: 41,
        detail_views: 7,
        contact_views: 2,
        inquiries: 1,
      },
    ];
  }

  async listInquiries(): Promise<RmixInquiry[]> {
    return [
      {
        inquiry_id: 'mock-1',
        advert_id: 'demo-2',
        created_at: new Date().toISOString(),
        email: 'zajemce@example.cz',
        phone: '+420123456789',
        name: 'Jana Nováková',
      },
    ];
  }

  async listFullInquiries(): Promise<RmixInquiry[]> {
    const inquiries = await this.listInquiries();
    return inquiries.map((inquiry) => ({
      ...inquiry,
      message: 'Mock zpráva – dobrý den, mám zájem o prohlídku.',
    }));
  }

  async getInquiry(inquiryId: string): Promise<RmixInquiry> {
    return {
      inquiry_id: inquiryId,
      advert_id: 'demo-2',
      created_at: new Date().toISOString(),
      email: 'zajemce@example.cz',
      phone: '+420123456789',
      name: 'Jana Nováková',
      message: 'Mock detail.',
    };
  }
}

export type RealitymixClientLike = MockRealitymixClient | import('./client.js').RealitymixClient;
