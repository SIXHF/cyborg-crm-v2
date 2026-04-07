import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import crypto from 'crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateRef(): string {
  return 'CC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return p;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function maskCard(ccn: string): string {
  const digits = ccn.replace(/\D/g, '');
  if (digits.length < 4) return ccn;
  return '****' + digits.slice(-4);
}

export function detectCardBrand(bin: string): string {
  if (!bin) return '';
  if (bin[0] === '4') return 'Visa';
  if (bin[0] === '5' && bin[1] >= '1' && bin[1] <= '5') return 'Mastercard';
  if (bin[0] === '3' && (bin[1] === '4' || bin[1] === '7')) return 'Amex';
  if (bin.startsWith('6011') || bin.startsWith('65')) return 'Discover';
  return '';
}
