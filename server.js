require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ CONFIGURACIÓN ============
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yoser2025';
const USE_POSTGRES = !!process.env.DATABASE_URL;
// =======================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ BASE DE DATOS ============
let db;

if (USE_POSTGRES) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    });

    pool.query('SELECT NOW()')
        .then(() => console.log('✅ Conexión a PostgreSQL establecida'))
        .catch(err => console.error('❌ Error conectando a PostgreSQL:', err.message));

    db = {
        run: async (sql, params = []) => {
            const result = await pool.query(sql, params);
            return { changes: result.rowCount };
        },
        get: async (sql, params = []) => {
            const result = await pool.query(sql, params);
            return result.rows[0];
        },
        all: async (sql, params = []) => {
            const result = await pool.query(sql, params);
            return result.rows;
        }
    };

    console.log('🐘 Usando PostgreSQL (producción)');

    (async () => {
        try {
            await pool.query(`CREATE TABLE IF NOT EXISTS boletos (
                numero TEXT PRIMARY KEY,
                nombre TEXT,
                telefono TEXT,
                estado TEXT DEFAULT 'disponible',
                fecha TEXT,
                grupo_id TEXT
            )`);
            await pool.query(`CREATE TABLE IF NOT EXISTS config (
                clave TEXT PRIMARY KEY,
                valor TEXT
            )`);
            await pool.query(`CREATE TABLE IF NOT EXISTS ganador (
                id INTEGER PRIMARY KEY,
                numero TEXT,
                premio TEXT,
                fecha_sorteo TEXT,
                fecha_publicacion TEXT
            )`);

            for (let i = 0; i < 100; i++) {
                const num = i.toString().padStart(2, '0');
                await pool.query(
                    `INSERT INTO boletos (numero, estado) VALUES ($1, 'disponible') ON CONFLICT (numero) DO NOTHING`,
                    [num]
                );
            }

            // Configuración inicial (solo si no existe)
            const configDefault = {
                nombre_rifa: 'SÚPER GRAN RIFA',
                premio: '$100.000',
                fecha_rifa: '15 de Octubre',
                loteria: 'Sinuano Noche',
                precio: '2000',
                nequi: '3024130451',
                titular: 'Yoser Fuentes',
                rifa_cerrada: 'false'
            };
            for (const [clave, valor] of Object.entries(configDefault)) {
                await pool.query(
                    `INSERT INTO config (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING`,
                    [clave, valor]
                );
            }

            console.log('✅ Base de datos PostgreSQL lista con 100 números');
        } catch (err) {
            console.error('❌ Error inicializando PostgreSQL:', err);
        }
    })();

} else {
    const sqlite3 = require('sqlite3').verbose();
    const sqliteDb = new sqlite3.Database('./boletos.db');

    db = {
        run: (sql, params = []) => new Promise((resolve, reject) => {
            const sqliteSql = sql.replace(/\$(\d+)/g, '?');
            sqliteDb.run(sqliteSql, params, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        }),
        get: (sql, params = []) => new Promise((resolve, reject) => {
            const sqliteSql = sql.replace(/\$(\d+)/g, '?');
            sqliteDb.get(sqliteSql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        }),
        all: (sql, params = []) => new Promise((resolve, reject) => {
            const sqliteSql = sql.replace(/\$(\d+)/g, '?');
            sqliteDb.all(sqliteSql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        })
    };

    sqliteDb.serialize(() => {
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS boletos (
            numero TEXT PRIMARY KEY,
            nombre TEXT,
            telefono TEXT,
            estado TEXT DEFAULT 'disponible',
            fecha TEXT,
            grupo_id TEXT
        )`);
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS config (
            clave TEXT PRIMARY KEY,
            valor TEXT
        )`);
        sqliteDb.run(`CREATE TABLE IF NOT EXISTS ganador (
            id INTEGER PRIMARY KEY,
            numero TEXT,
            premio TEXT,
            fecha_sorteo TEXT,
            fecha_publicacion TEXT
        )`);

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            sqliteDb.run(
                `INSERT OR IGNORE INTO boletos (numero, estado) VALUES (?, 'disponible')`,
                [num]
            );
        }

        const configDefault = {
            nombre_rifa: 'SÚPER GRAN RIFA',
            premio: '$100.000',
            fecha_rifa: '15 de Octubre',
            loteria: 'Sinuano Noche',
            precio: '2000',
            nequi: '3024130451',
            titular: 'Yoser Fuentes',
            rifa_cerrada: 'false'
        };
        for (const [clave, valor] of Object.entries(configDefault)) {
            sqliteDb.run(
                `INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)`,
                [clave, valor]
            );
        }

        console.log('💾 Usando SQLite (desarrollo local)');
        console.log('✅ Base de datos local lista con 100 números');
    });
}

// ============ HELPERS ============
async function getConfig() {
    const rows = await db.all("SELECT clave, valor FROM config");
    const config = {};
    rows.forEach(r => config[r.clave] = r.valor);
    return config;
}

// ============ MIDDLEWARE ADMIN ============
function verificarAdmin(req, res, next) {
    const pass = req.headers['x-admin-pass'] || req.query.pass;
    if (pass !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    next();
}

// ============ RUTAS PÚBLICAS ============

app.get('/api/config', async (req, res) => {
    try {
        const config = await getConfig();
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/numeros', async (req, res) => {
    try {
        const rows = await db.all(
            "SELECT numero, estado, nombre FROM boletos ORDER BY CAST(numero AS INTEGER) ASC"
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ganador', async (req, res) => {
    try {
        const row = await db.get(
            "SELECT * FROM ganador WHERE numero IS NOT NULL AND numero != '' ORDER BY id DESC LIMIT 1"
        );
        res.json(row || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/comprar', async (req, res) => {
    const { numeros, nombre, telefono } = req.body;

    if (!numeros || numeros.length === 0 || !nombre || !telefono) {
        return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    try {
        // Verificar si la rifa está cerrada
        const config = await getConfig();
        if (config.rifa_cerrada === 'true') {
            return res.status(400).json({ success: false, message: "La rifa está cerrada" });
        }

        const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        const grupoId = 'G' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

        for (const num of numeros) {
            const row = await db.get(
                "SELECT estado FROM boletos WHERE numero = $1",
                [num]
            );

            if (!row || row.estado !== 'disponible') {
                return res.status(400).json({
                    success: false,
                    message: `El número ${num} ya fue seleccionado por alguien más.`
                });
            }
        }

        for (const num of numeros) {
            await db.run(
                "UPDATE boletos SET nombre = $1, telefono = $2, estado = 'reservado', fecha = $3, grupo_id = $4 WHERE numero = $5",
                [nombre, telefono, fecha, grupoId, num]
            );
        }

        console.log('🎟️ NUEVA VENTA:');
        console.log(`   Nombre:   ${nombre}`);
        console.log(`   Teléfono: ${telefono}`);
        console.log(`   Números:  ${numeros.join(', ')}`);
        console.log(`   Fecha:    ${fecha}`);
        console.log('-----------------------------------');

        res.json({ success: true, message: "¡Reserva exitosa!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error en el servidor" });
    }
});

// ============ RUTAS ADMIN ============

app.get('/api/admin/ventas', verificarAdmin, async (req, res) => {
    try {
        // Agrupar por grupo_id (o por nombre+telefono para ventas antiguas sin grupo)
        const rows = await db.all(
            `SELECT 
                COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha) as grupo,
                nombre, 
                telefono, 
                fecha,
                STRING_AGG(numero, ',' ORDER BY CAST(numero AS INTEGER)) as numeros,
                COUNT(*) as cantidad
             FROM boletos 
             WHERE estado = 'reservado' 
             GROUP BY COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha), nombre, telefono, fecha
             ORDER BY fecha DESC`
        ).catch(async (err) => {
            // Fallback para SQLite (que no tiene STRING_AGG)
            if (USE_POSTGRES) throw err;
            return await db.all(
                `SELECT 
                    COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha) as grupo,
                    nombre, 
                    telefono, 
                    fecha,
                    GROUP_CONCAT(numero) as numeros,
                    COUNT(*) as cantidad
                 FROM boletos 
                 WHERE estado = 'reservado' 
                 GROUP BY COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha), nombre, telefono, fecha
                 ORDER BY fecha DESC`
            );
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/resumen', verificarAdmin, async (req, res) => {
    try {
        const config = await getConfig();
        const precio = parseInt(config.precio) || 2000;
        const row = await db.get(
            `SELECT 
                COUNT(CASE WHEN estado = 'reservado' THEN 1 END) as vendidos,
                COUNT(CASE WHEN estado = 'disponible' THEN 1 END) as disponibles,
                COUNT(*) as total,
                COUNT(CASE WHEN estado = 'reservado' THEN 1 END) * $1 as recaudado
             FROM boletos`,
            [precio]
        );
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Configuración de la rifa (GET)
app.get('/api/admin/config', verificarAdmin, async (req, res) => {
    try {
        const config = await getConfig();
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Configuración de la rifa (POST - actualizar)
app.post('/api/admin/config', verificarAdmin, async (req, res) => {
    try {
        const campos = ['nombre_rifa', 'premio', 'fecha_rifa', 'loteria', 'precio', 'nequi', 'titular', 'rifa_cerrada'];
        for (const campo of campos) {
            if (req.body[campo] !== undefined) {
                await db.run(
                    `INSERT INTO config (clave, valor) VALUES ($1, $2) 
                     ON CONFLICT (clave) DO UPDATE SET valor = $2`,
                    [campo, String(req.body[campo])]
                );
            }
        }
        res.json({ success: true, message: 'Configuración actualizada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Liberar un número
app.post('/api/admin/liberar', verificarAdmin, async (req, res) => {
    const { numero } = req.body;
    if (!numero) return res.status(400).json({ error: 'Falta el número' });

    try {
        const result = await db.run(
            "UPDATE boletos SET nombre = NULL, telefono = NULL, estado = 'disponible', fecha = NULL, grupo_id = NULL WHERE numero = $1",
            [numero]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Número no encontrado' });
        }

        console.log(`🔓 Número ${numero} liberado`);
        res.json({ success: true, message: `Número ${numero} liberado` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Liberar un grupo completo (todos los números de una venta)
app.post('/api/admin/liberar-grupo', verificarAdmin, async (req, res) => {
    const { grupo } = req.body;
    if (!grupo) return res.status(400).json({ error: 'Falta el grupo' });

    try {
        const result = await db.run(
            `UPDATE boletos SET nombre = NULL, telefono = NULL, estado = 'disponible', fecha = NULL, grupo_id = NULL 
             WHERE COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha) = $1`,
            [grupo]
        );

        console.log(`🔓 Grupo ${grupo} liberado (${result.changes} números)`);
        res.json({ success: true, message: `${result.changes} números liberados` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exportar a CSV (agrupado)
app.get('/api/admin/exportar', verificarAdmin, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT 
                COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha) as grupo,
                nombre, 
                telefono, 
                fecha,
                STRING_AGG(numero, ', ' ORDER BY CAST(numero AS INTEGER)) as numeros,
                COUNT(*) as cantidad
             FROM boletos 
             WHERE estado = 'reservado' 
             GROUP BY COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha), nombre, telefono, fecha
             ORDER BY fecha DESC`
        ).catch(async (err) => {
            if (USE_POSTGRES) throw err;
            return await db.all(
                `SELECT 
                    COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha) as grupo,
                    nombre, 
                    telefono, 
                    fecha,
                    GROUP_CONCAT(numero) as numeros,
                    COUNT(*) as cantidad
                 FROM boletos 
                 WHERE estado = 'reservado' 
                 GROUP BY COALESCE(grupo_id, 'legacy-' || telefono || '-' || fecha), nombre, telefono, fecha
                 ORDER BY fecha DESC`
            );
        });

        let csv = '\uFEFF';
        csv += 'Nombre,Telefono,Numeros,Cantidad,Fecha\n';

        rows.forEach(r => {
            csv += `"${r.nombre || ''}","${r.telefono || ''}","${r.numeros || ''}","${r.cantidad || ''}","${r.fecha || ''}"\n`;
        });

        const fecha = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=ventas_rifa_${fecha}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ GANADOR ============

// Obtener ganador (admin)
app.get('/api/admin/ganador', verificarAdmin, async (req, res) => {
    try {
        const row = await db.get(
            "SELECT * FROM ganador ORDER BY id DESC LIMIT 1"
        );
        res.json(row || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Establecer ganador
app.post('/api/admin/ganador', verificarAdmin, async (req, res) => {
    const { numero, premio, fecha_sorteo } = req.body;
    if (!numero) return res.status(400).json({ error: 'Falta el número ganador' });

    try {
        const fechaPublicacion = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        await db.run(
            `INSERT INTO ganador (numero, premio, fecha_sorteo, fecha_publicacion) 
             VALUES ($1, $2, $3, $4)`,
            [numero, premio || '', fecha_sorteo || '', fechaPublicacion]
        );
        console.log(`🏆 Ganador registrado: ${numero}`);
        res.json({ success: true, message: `Ganador registrado: ${numero}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar ganador (para corregir)
app.post('/api/admin/ganador/eliminar', verificarAdmin, async (req, res) => {
    try {
        await db.run("DELETE FROM ganador");
        res.json({ success: true, message: 'Ganador eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ INICIAR SERVIDOR ============
app.listen(PORT, () => {
    console.log('===========================================');
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`👤 Página pública:  /`);
    console.log(`🔐 Panel admin:     /admin.html`);
    console.log(`🔑 Contraseña:      ${ADMIN_PASSWORD}`);
    console.log(`🗄️  Base de datos:   ${USE_POSTGRES ? 'PostgreSQL' : 'SQLite'}`);
    console.log('===========================================');
});