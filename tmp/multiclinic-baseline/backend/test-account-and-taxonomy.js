const BASE_URL = 'http://localhost:4000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('🚀 Starting Account & Taxonomy Integration Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message} ${details ? '- ' + JSON.stringify(details) : ''}`);
      failed++;
    }
  }

  try {
    // 1. Login as standard staff (receptionist)
    console.log('--- TEST 1: Standard Staff (recepcao@viverbem.com) Authentication ---');
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'recepcao@viverbem.com', password: '123456' })
    });
    assert(loginRes.status === 200 && loginRes.data.token, 'Receptionist logs in successfully', loginRes.data);
    let staffToken = loginRes.data.token;

    // 2. Attempt email change to existing email (admin@saas.com) -> should 409
    console.log('\n--- TEST 2: Email Uniqueness & Change ---');
    const dupRes = await request('/auth/profile/email', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ email: 'admin@saas.com' })
    });
    assert(dupRes.status === 409, 'Duplicate email returns HTTP 409 Conflict', dupRes.data);

    // Change to a new email
    const changeEmailRes = await request('/auth/profile/email', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ email: 'recepcao.temp@viverbem.com' })
    });
    assert(changeEmailRes.status === 200 && changeEmailRes.data.email === 'recepcao.temp@viverbem.com', 'Email updated successfully', changeEmailRes.data);

    // Old email login must fail
    const oldLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'recepcao@viverbem.com', password: '123456' })
    });
    assert(oldLoginRes.status === 401, 'Login with old email fails (401)');

    // New email login must succeed
    const newEmailLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'recepcao.temp@viverbem.com', password: '123456' })
    });
    assert(newEmailLoginRes.status === 200 && newEmailLoginRes.data.token, 'Login with new email succeeds (200)');
    staffToken = newEmailLoginRes.data.token;

    // 3. Password change
    console.log('\n--- TEST 3: Password Change ---');
    const changePassRes = await request('/auth/profile/password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ currentPassword: '123456', newPassword: 'novaSenhaStaff123' })
    });
    assert(changePassRes.status === 200 && changePassRes.data.message, 'Password updated successfully', changePassRes.data);

    // Old password login must fail
    const oldPassLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'recepcao.temp@viverbem.com', password: '123456' })
    });
    assert(oldPassLoginRes.status === 401, 'Login with old password fails (401)');

    // New password login must succeed
    const newPassLoginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'recepcao.temp@viverbem.com', password: 'novaSenhaStaff123' })
    });
    assert(newPassLoginRes.status === 200 && newPassLoginRes.data.token, 'Login with new password succeeds (200)');
    staffToken = newPassLoginRes.data.token;

    // 4. Revert credentials back to original
    console.log('\n--- TEST 4: Revert Staff Credentials to Default ---');
    const revertPassRes = await request('/auth/profile/password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ currentPassword: 'novaSenhaStaff123', newPassword: '123456' })
    });
    assert(revertPassRes.status === 200, 'Reverted staff password back to 123456', revertPassRes.data);

    const revertEmailRes = await request('/auth/profile/email', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ email: 'recepcao@viverbem.com' })
    });
    assert(revertEmailRes.status === 200, 'Reverted staff email back to recepcao@viverbem.com', revertEmailRes.data);

    // Verify original credentials work again
    const finalStaffLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'recepcao@viverbem.com', password: '123456' })
    });
    assert(finalStaffLogin.status === 200, 'Original credentials verified working', finalStaffLogin.data);

    // 5. RBAC on Global Taxonomy: Clinic Admin (diretoria@viverbem.com) is forbidden
    console.log('\n--- TEST 5: Role-based Authorization for Global Taxonomy ---');
    const adminLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'diretoria@viverbem.com', password: '123456' })
    });
    const clinicAdminToken = adminLogin.data.token;

    const forbiddenCatRes = await request('/taxonomy/categories', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: JSON.stringify({ name: 'Tipo Teste Proibido' })
    });
    assert(forbiddenCatRes.status === 403, 'Clinic Admin forbidden from creating global service category (403)');

    const forbiddenProfRes = await request('/taxonomy/professions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicAdminToken}` },
      body: JSON.stringify({ name: 'Profissão Proibida', category_id: 1 })
    });
    assert(forbiddenProfRes.status === 403, 'Clinic Admin forbidden from creating global profession (403)');

    // 6. SuperAdmin Global Taxonomy Operations
    console.log('\n--- TEST 6: SuperAdmin Taxonomy Management ---');
    const saLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@saas.com', password: '123456' })
    });
    assert(saLogin.status === 200 && saLogin.data.token, 'SuperAdmin logged in successfully');
    const saToken = saLogin.data.token;

    // Create Category
    const createCatRes = await request('/taxonomy/categories', {
      method: 'POST',
      headers: { Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({
        name: 'Harmonização Facial e Estética',
        slug: 'estetica-facial-' + Date.now(),
        description: 'Serviços estéticos e harmonização',
        defaultTerminology: 'cliente',
        isClinical: false
      })
    });
    assert(createCatRes.status === 201 && createCatRes.data.id, 'SuperAdmin created new service category', createCatRes.data);
    const newCatId = createCatRes.data.id;

    // Edit Category
    const editCatRes = await request(`/taxonomy/categories/${newCatId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({
        name: 'Harmonização e Estética Integrada',
        description: 'Serviços estéticos corporais e faciais'
      })
    });
    assert(editCatRes.status === 200 && editCatRes.data.message, 'SuperAdmin updated service category', editCatRes.data);

    // Toggle Category Status (deactivate)
    const toggleCatRes = await request(`/taxonomy/categories/${newCatId}/toggle-status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${saToken}` }
    });
    assert(toggleCatRes.status === 200 && toggleCatRes.data.active === 0, 'Category deactivated (status toggle)', toggleCatRes.data);

    // Verify ?all=true lists inactive categories, whereas standard list filters out inactive
    const catListActiveOnly = await request('/taxonomy/categories');
    const catListAll = await request('/taxonomy/categories?all=true', {
      headers: { Authorization: `Bearer ${saToken}` }
    });
    assert(Array.isArray(catListActiveOnly.data) && !catListActiveOnly.data.some(c => c.id === newCatId), 'Inactive category is hidden from public list');
    assert(Array.isArray(catListAll.data) && catListAll.data.some(c => c.id === newCatId), 'Inactive category is visible in SuperAdmin ?all=true list');

    // Reactivate Category
    const reactivateCatRes = await request(`/taxonomy/categories/${newCatId}/toggle-status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${saToken}` }
    });
    assert(reactivateCatRes.status === 200 && reactivateCatRes.data.active === 1, 'Category reactivated successfully');

    // Create Profession
    const createProfRes = await request('/taxonomy/professions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({
        name: 'Esteticista Avançado ' + Date.now(),
        categoryId: newCatId,
        registrationBoardLabel: 'CRBM / COREN',
        registrationRequired: true
      })
    });
    assert(createProfRes.status === 201 && createProfRes.data.id, 'SuperAdmin created new profession', createProfRes.data);
    const newProfId = createProfRes.data.id;

    // Edit Profession
    const editProfRes = await request(`/taxonomy/professions/${newProfId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${saToken}` },
      body: JSON.stringify({
        name: 'Especialista em Estética Facial',
        registrationBoardLabel: 'Registro Profissional'
      })
    });
    assert(editProfRes.status === 200 && editProfRes.data.message, 'SuperAdmin updated profession', editProfRes.data);

    // Toggle Profession Status
    const toggleProfRes = await request(`/taxonomy/professions/${newProfId}/toggle-status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${saToken}` }
    });
    assert(toggleProfRes.status === 200 && toggleProfRes.data.active === 0, 'Profession deactivated (status toggle)');

    const profListActiveOnly = await request('/taxonomy/professions');
    const profListAll = await request('/taxonomy/professions?all=true', {
      headers: { Authorization: `Bearer ${saToken}` }
    });
    assert(Array.isArray(profListActiveOnly.data) && !profListActiveOnly.data.some(p => p.id === newProfId), 'Inactive profession hidden from standard list');
    assert(Array.isArray(profListAll.data) && profListAll.data.some(p => p.id === newProfId), 'Inactive profession visible in SuperAdmin ?all=true list');

  } catch (err) {
    console.error('Unexpected error during test:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  process.exit(failed === 0 ? 0 : 1);
}

runTests();
