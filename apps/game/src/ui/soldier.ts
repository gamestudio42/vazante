import { t } from '../i18n.ts';

/** "Cb. Moura": short rank and surname. */
export function soldierLabel(rank: number, name: string): string {
  return `${t(`rank.short.${rank}`)} ${name}`;
}
