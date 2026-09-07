const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const DB_FILE = path.join(__dirname, '..', 'ercomaq.db');
let _db = null;
class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
  }
  exec(sql) {
    this._db.exec(sql);
    this._save();
  }
  prepare(sql) {
    const db = this;
    return {
      run(...params) {
        const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const stmt = db._db.prepare(sql);
        try {
          stmt.run(args);
        } finally {
          stmt.free();
        }
        const changes = db._db.exec('SELECT changes() AS c')[0].values[0][0];
        const lastInsertRowid = db._db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
        db._save();
        return { changes, lastInsertRowid };
      },
      get(...params) {
        const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const stmt = db._db.prepare(sql);
        try {
          stmt.bind(args);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          return row && Object.keys(row).length ? row : undefined;
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const stmt = db._db.prepare(sql);
        try {
          stmt.bind(args);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      }
    };
  }
  pragma(sql) {
    try { this._db.exec('PRAGMA ' + sql); } catch (e) {}
  }
  _save() {
    fs.writeFileSync(DB_FILE, Buffer.from(this._db.export()));
  }
}
const dbFacade = {
  prepare: (...a) => _db.prepare(...a),
  exec: (...a) => _db.exec(...a),
  pragma: (...a) => _db.pragma(...a)
};
function seed() {
  const uCount = dbFacade.prepare('SELECT COUNT(*) AS c FROM usuarios').get().c;
  if (uCount === 0) {
    const ins = dbFacade.prepare('INSERT INTO usuarios (nome,email,senha_hash,perfil) VALUES (?,?,?,?)');
    [
      ['Administrador', 'admin@ercomaq.com.br', 'admin123', 'admin'],
      ['Revisor', 'revisor@ercomaq.com.br', 'revisor123', 'revisor'],
      ['Técnico', 'tecnico@ercomaq.com.br', 'tecnico123', 'tecnico'],
      ['Comercial', 'comercial@ercomaq.com.br', 'comercial123', 'comercial']
    ].forEach(u => ins.run(u[0], u[1], bcrypt.hashSync(u[2], 10), u[3]));
  }
  const cCount = dbFacade.prepare('SELECT COUNT(*) AS c FROM clientes').get().c;
  if (cCount === 0) {
    const cli = dbFacade.prepare(`INSERT INTO clientes (empresa,fantasia,contato,email,telefone,endereco,bairro,cidade,cep)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('Moschetta Madeiras', 'Moschetta', 'João Moschetta', 'joao@moschetta.com.br', '(11) 4000-0000', 'Rua das Indústrias, 100', 'Industrial', 'São Paulo', '01100-000');
    const maq = dbFacade.prepare('INSERT INTO maquinas (cliente_id,descricao,numero_serie) VALUES (?,?,?)')
      .run(cli.lastInsertRowid, 'Serra Circular SC500', 'SC500-2024-001');
    const serv = dbFacade.prepare('INSERT INTO catalogo_servicos (codigo,descricao,unidade,valor_unitario) VALUES (?,?,?,?)');
    serv.run('SVC001', 'Troca de rolamento', 'un', 120);
    serv.run('SVC002', 'Balanceamento de lâmina', 'un', 80);
    serv.run('SVC003', 'Troca de motor', 'un', 350);
    serv.run('SVC004', 'Revisão geral', 'h', 250);
    serv.run('SVC005', 'Ajuste de lâmina', 'un', 60);
    const tecnico = dbFacade.prepare("SELECT id FROM usuarios WHERE perfil='tecnico'").get();
    const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const os = dbFacade.prepare(`INSERT INTO os (numero,cliente_id,maquina_id,tecnico_id,status,assunto,defeito,servico_realizado,observacoes,data_hora_em_revisao)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run('OS-0001', cli.lastInsertRowid, maq.lastInsertRowid, tecnico.id, 'em_revisao',
      'Vibração excessiva', 'Cliente relatou vibração excessiva na serra durante o corte.',
      'Inspeção do eixo e rolamentos; identificada folga no rolamento principal.',
      'Aguardando definição de valores pelo revisor.', agora);
    dbFacade.prepare(`INSERT INTO os_materiais (os_id,descricao_tecnico,status_normalizacao,quantidade,unidade) VALUES (?,?,?,?,?)`)
      .run(os.lastInsertRowid, 'Rolamento grande que estava solto', 'pendente', 1, 'un');
    dbFacade.prepare(`INSERT INTO os_materiais (os_id,descricao_tecnico,status_normalizacao,quantidade,unidade) VALUES (?,?,?,?,?)`)
      .run(os.lastInsertRowid, 'Graxa para rolamento', 'pendente', 1, 'lata');
    const cat = dbFacade.prepare("SELECT * FROM catalogo_servicos WHERE codigo='SVC001'").get();
    dbFacade.prepare(`INSERT INTO os_servicos (os_id,catalogo_id,descricao,horas,valor_unitario,valor_total) VALUES (?,?,?,?,?,?)`)
      .run(os.lastInsertRowid, cat.id, cat.descricao, 1, cat.valor_unitario, cat.valor_unitario);
    dbFacade.prepare(`INSERT INTO os_horas (os_id,data,colaborador,entrada,saida,tempo_total) VALUES (?,?,?,?,?,?)`)
      .run(os.lastInsertRowid, agora.slice(0, 10), 'Técnico', '07:15', '09:15', '02:00:00');
    dbFacade.prepare(`INSERT INTO vistos (os_id,tipo,status) VALUES (?, 'revisor','pendente')`).run(os.lastInsertRowid);
    dbFacade.prepare(`INSERT INTO historico (os_id,status_anterior,status_novo,observacao) VALUES (?, 'rascunho','em_revisao','OS criada e enviada para revisão')`)
      .run(os.lastInsertRowid);
  }
}
async function init() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file)
  });
  let sqlDb;
  if (fs.existsSync(DB_FILE)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    sqlDb = new SQL.Database();
  }
  _db = new Database(sqlDb);
  _db.pragma('foreign_keys = ON');
  _db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin','revisor','tecnico','comercial')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  fantasia TEXT,
  contato TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  cep TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS maquinas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  descricao TEXT NOT NULL,
  numero_serie TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS catalogo_servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'h',
  valor_unitario REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS os (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  maquina_id INTEGER REFERENCES maquinas(id),
  tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aguardando_cliente','aprovada','cobrada','recebida','cancelada')),
  data_entrada TEXT NOT NULL DEFAULT (date('now')),
  data_saida TEXT,
  assunto TEXT,
  defeito TEXT,
  servico_realizado TEXT,
  observacoes TEXT,
  solicitante TEXT,
  tipo_assistencia TEXT NOT NULL DEFAULT 'cobranca' CHECK (tipo_assistencia IN ('cobranca','garantia')),
  valor_garantia REAL NOT NULL DEFAULT 0,
  valor_cobranca REAL NOT NULL DEFAULT 0,
  horas_encerradas REAL NOT NULL DEFAULT 0,
  data_encerramento TEXT,
  data_hora_em_revisao TEXT,
  data_hora_envio TEXT,
  token_aprovacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS os_materiais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  descricao_tecnico TEXT NOT NULL,
  status_normalizacao TEXT NOT NULL DEFAULT 'pendente' CHECK (status_normalizacao IN ('pendente','normalizado')),
  codigo_erp TEXT,
  descricao_erp TEXT,
  valor_unitario REAL,
  quantidade REAL NOT NULL DEFAULT 1,
  unidade TEXT NOT NULL DEFAULT 'un',
  valor_total REAL,
  garantia INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS os_servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  catalogo_id INTEGER REFERENCES catalogo_servicos(id),
  descricao TEXT NOT NULL,
  horas REAL NOT NULL DEFAULT 1,
  valor_unitario REAL NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL DEFAULT 0,
  garantia INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS os_horas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  data TEXT,
  colaborador TEXT NOT NULL,
  entrada TEXT,
  saida TEXT,
  tempo_total TEXT
);
CREATE TABLE IF NOT EXISTS vistos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('revisor','cliente')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado')),
  data_hora TEXT,
  usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL REFERENCES os(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  observacao TEXT,
  data_hora TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER REFERENCES os(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  destinatario TEXT,
  data_envio TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'registrada' CHECK (status IN ('registrada','enviada','falha')),
  detalhes TEXT
);
`);
  // Migração: adiciona a coluna data em os_horas para bancos existentes
  try {
    const cols = _db.prepare('PRAGMA table_info(os_horas)').all().map(c => c.name);
    if (!cols.includes('data')) {
      _db.exec('ALTER TABLE os_horas ADD COLUMN data TEXT');
    }
  } catch (e) {}
  // Migração: adiciona a coluna solicitante na tabela os (bancos existentes)
  try {
    const colsOs = _db.prepare('PRAGMA table_info(os)').all().map(c => c.name);
    if (!colsOs.includes('solicitante')) {
      _db.exec('ALTER TABLE os ADD COLUMN solicitante TEXT');
    }
  } catch (e) {}
  // Migração: recria a tabela os para o novo modelo (tipo_assistencia + valores congelados; remove desconto e garantia_geral)
  try {
    const colsOs2 = _db.prepare('PRAGMA table_info(os)').all().map(c => c.name);
    if (!colsOs2.includes('tipo_assistencia')) {
      _db.pragma('foreign_keys = OFF');
      _db.exec(`
BEGIN;
CREATE TABLE os_novo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  maquina_id INTEGER REFERENCES maquinas(id),
  tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aguardando_cliente','aprovada','cobrada','recebida','cancelada')),
  data_entrada TEXT NOT NULL DEFAULT (date('now')),
  data_saida TEXT,
  assunto TEXT,
  defeito TEXT,
  servico_realizado TEXT,
  observacoes TEXT,
  solicitante TEXT,
  tipo_assistencia TEXT NOT NULL DEFAULT 'cobranca' CHECK (tipo_assistencia IN ('cobranca','garantia')),
  valor_garantia REAL NOT NULL DEFAULT 0,
  valor_cobranca REAL NOT NULL DEFAULT 0,
  horas_encerradas REAL NOT NULL DEFAULT 0,
  data_encerramento TEXT,
  data_hora_em_revisao TEXT,
  data_hora_envio TEXT,
  token_aprovacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT
);
INSERT INTO os_novo (id,numero,cliente_id,maquina_id,tecnico_id,status,data_entrada,data_saida,assunto,defeito,servico_realizado,observacoes,solicitante,tipo_assistencia,valor_garantia,valor_cobranca,horas_encerradas,data_encerramento,data_hora_em_revisao,data_hora_envio,token_aprovacao,criado_em,atualizado_em)
  SELECT o.id,o.numero,o.cliente_id,o.maquina_id,o.tecnico_id,o.status,o.data_entrada,o.data_saida,o.assunto,o.defeito,o.servico_realizado,o.observacoes,o.solicitante,
    CASE WHEN o.garantia_geral = 1 THEN 'garantia' ELSE 'cobranca' END,
    COALESCE((SELECT SUM(m.valor_total) FROM os_materiais m WHERE m.os_id=o.id AND m.garantia=1),0) + COALESCE((SELECT SUM(s.valor_total) FROM os_servicos s WHERE s.os_id=o.id AND s.garantia=1),0),
    COALESCE((SELECT SUM(m.valor_total) FROM os_materiais m WHERE m.os_id=o.id AND m.garantia=0),0) + COALESCE((SELECT SUM(s.valor_total) FROM os_servicos s WHERE s.os_id=o.id AND s.garantia=0),0),
    COALESCE((SELECT SUM(CAST(substr(h.tempo_total,1,2) AS REAL) + CAST(substr(h.tempo_total,4,2) AS REAL)/60.0) FROM os_horas h WHERE h.os_id=o.id AND h.tempo_total IS NOT NULL AND h.tempo_total != ''),0),
    o.data_hora_envio,
    o.data_hora_em_revisao,o.data_hora_envio,o.token_aprovacao,o.criado_em,o.atualizado_em
  FROM os o;
DROP TABLE os;
ALTER TABLE os_novo RENAME TO os;
COMMIT;`);
      _db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    try { _db.exec('ROLLBACK'); } catch (_) {}
  }
  // Migração: adiciona o status 'recebida' na tabela os (bancos que já migraram para tipo_assistencia)
  try {
    const sqlOs = _db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='os'").get();
    if (sqlOs && sqlOs.sql && !sqlOs.sql.includes('recebida')) {
      _db.pragma('foreign_keys = OFF');
      _db.exec(`
BEGIN;
CREATE TABLE os_novo2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  maquina_id INTEGER REFERENCES maquinas(id),
  tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aguardando_cliente','aprovada','cobrada','recebida','cancelada')),
  data_entrada TEXT NOT NULL DEFAULT (date('now')),
  data_saida TEXT,
  assunto TEXT,
  defeito TEXT,
  servico_realizado TEXT,
  observacoes TEXT,
  solicitante TEXT,
  tipo_assistencia TEXT NOT NULL DEFAULT 'cobranca' CHECK (tipo_assistencia IN ('cobranca','garantia')),
  valor_garantia REAL NOT NULL DEFAULT 0,
  valor_cobranca REAL NOT NULL DEFAULT 0,
  horas_encerradas REAL NOT NULL DEFAULT 0,
  data_encerramento TEXT,
  data_hora_em_revisao TEXT,
  data_hora_envio TEXT,
  token_aprovacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT
);
INSERT INTO os_novo2 (id,numero,cliente_id,maquina_id,tecnico_id,status,data_entrada,data_saida,assunto,defeito,servico_realizado,observacoes,solicitante,tipo_assistencia,valor_garantia,valor_cobranca,horas_encerradas,data_encerramento,data_hora_em_revisao,data_hora_envio,token_aprovacao,criado_em,atualizado_em)
  SELECT id,numero,cliente_id,maquina_id,tecnico_id,status,data_entrada,data_saida,assunto,defeito,servico_realizado,observacoes,solicitante,tipo_assistencia,valor_garantia,valor_cobranca,horas_encerradas,data_encerramento,data_hora_em_revisao,data_hora_envio,token_aprovacao,criado_em,atualizado_em FROM os;
DROP TABLE os;
ALTER TABLE os_novo2 RENAME TO os;
COMMIT;`);
      _db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    try { _db.exec('ROLLBACK'); } catch (_) {}
  }
  seed();
  return _db;
}
module.exports = dbFacade;
module.exports.init = init;