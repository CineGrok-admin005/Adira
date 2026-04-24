import path from 'path';

// ARIA's visual identity — used when image generation is wired up
export const ARIA_AVATAR_PATH = path.join(__dirname, '../../assets/aria-avatar.png');

export const ARIA_IDENTITY = {
  name: 'ARIA',
  fullName: 'Automated Reporter for Important Announcements',
  byline: '— ARIA, CineGrok',
  avatarPath: ARIA_AVATAR_PATH,
};
