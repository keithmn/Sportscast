document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('shop-waitlist-form');
  const errorEl = document.getElementById('shop-form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const email = document.getElementById('shop-email').value.trim();
    try {
      await api('/api/submissions', { method: 'POST', body: JSON.stringify({ type: 'SHOP_INTEREST', email }) });
      form.style.display = 'none';
      document.getElementById('shop-form-success').style.display = 'block';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
});
