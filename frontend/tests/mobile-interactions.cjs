process.env.MOBILE_INTERACTIONS = '1';
process.env.MOBILE_WIDTHS = '320,360,390,430';
process.env.MOBILE_ROUTES = '/dashboard,/agenda,/pacientes,/financeiro,/estoque,/orcamentos,/zemda-personal/patient,/configuracoes,/superadmin';
require('./mobile-overflow.cjs');
