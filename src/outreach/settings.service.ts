import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Owner-editable outreach settings, stored in the Setting table. */
export const DEFAULT_SETTINGS = {
  paused: 'false',
  dailyLimit: '20', // emails per rolling 24 hours; research says stay under ~30 per inbox
  sendStartHour: '9', // business hours, US Eastern, Mon-Fri
  sendEndHour: '17',
  followUp1Days: '4',
  followUp2Days: '7',
  autoPrepare: 'true', // weekday mornings: draft follow-ups + first emails for new partners
  fromName: 'Vault Partnerships',
  postalAddress: '', // required by CAN-SPAM; nothing sends until this is filled in
  signature: 'Best,\nThe Vault team',
  pauseReason: '',
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<Settings> {
    const rows = await this.prisma.setting.findMany();
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
    return out;
  }

  async update(patch: Partial<Settings>) {
    const entries = Object.entries(patch).filter(([k, v]) => k in DEFAULT_SETTINGS && typeof v === 'string');
    await this.prisma.$transaction(
      entries.map(([key, value]) => this.prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })),
    );
    return this.all();
  }

  /** Internal state that isn't shown as a setting (e.g. last inbox check). */
  async getState(key: string) {
    return (await this.prisma.setting.findUnique({ where: { key: `state:${key}` } }))?.value ?? null;
  }

  async setState(key: string, value: string) {
    await this.prisma.setting.upsert({ where: { key: `state:${key}` }, update: { value }, create: { key: `state:${key}`, value } });
  }
}
