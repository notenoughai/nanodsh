export function isProfileName(name) {
  return typeof name === 'string' && name !== '' && !name.includes('/') && !/\s/.test(name) && name !== '.' && name !== '..' && !name.startsWith('-');
}
