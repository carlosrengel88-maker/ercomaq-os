const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ercomaq-chave-secreta-padrao';

function sign(user) {
  return jwt.sign(
    { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessão expirada, faça login novamente' });
  }
}

function requireProfile(...perfis) {
  return (req, res, next) => {
    if (!req.user || !perfis.includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para esta ação' });
    }
    next();
  };
}

module.exports = { sign, auth, requireProfile };