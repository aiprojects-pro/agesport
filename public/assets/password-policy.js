(function (root) {
  const help =
    'De 8 a 72 caracteres: al menos una mayúscula, una minúscula y un número. Admite letras sin tildes, números y todos los símbolos del teclado, incluido el punto. No admite espacios.';
  function error(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 72)
      return 'La contraseña debe tener de 8 a 72 caracteres.';
    if (!/^[!-~]+$/.test(value))
      return 'La contraseña no admite espacios, tildes ni caracteres fuera del teclado latino básico.';
    if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value))
      return 'La contraseña necesita al menos una mayúscula, una minúscula y un número.';
    return null;
  }
  const policy = { help, error, valid: (value) => !error(value) };
  if (typeof module === 'object' && module.exports) module.exports = policy;
  else {
    root.AgesportPassword = policy;
    document.querySelectorAll('[data-password-help]').forEach((el) => {
      el.textContent = help;
    });
    document.querySelectorAll('#password,#newPassword').forEach((el) => {
      el.minLength = 8;
      el.maxLength = 72;
      el.addEventListener('input', () => el.setCustomValidity(error(el.value) || ''));
    });
  }
})(typeof window === 'undefined' ? globalThis : window);
