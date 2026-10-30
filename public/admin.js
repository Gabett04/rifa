let password = '';
let ventasCache = [];
let configActual = {};
let ganadorActual = null;

// ========== LOGIN ==========
function login() {
    const pass = document.getElementById('password').value;
    if (!pass) {
        document.getElementById('login-error').textContent = 'Ingresa la contraseña';
        return;
    }

    fetch('/api/admin/resumen', {
        headers: { 'x-admin-pass': pass }
    })
    .then(res => {
        if (res.status === 401) {
            document.getElementById('login-error').textContent = '❌ Contraseña incorrecta';
            throw new Error('No autorizado');
        }
        return res.json();
    })
    .then(() => {
        password = pass;
        sessionStorage.setItem('admin_pass', pass);
        document.getElementById('login-box').style.display = 'none';
        document.getElementById('dashboard').classList.add('active');
        cargarTodo();
        setInterval(cargarDatos, 15000); // Actualiza ventas cada 15s
    })
    .catch(err => console.error(err));
}

function logout() {
    sessionStorage.removeItem('admin_pass');
    location.reload();
}

// ========== PESTAÑAS ==========
function cambiarTab(tab, event) {
    // Quitar activo de todos
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // Activar el seleccionado
    if (event && event.target) {
        event.target.classList.add('active');
    }
    document.getElementById('tab-' + tab).classList.add('active');

    // Cargar datos según pestaña
    if (tab === 'config') cargarConfig();
    if (tab === 'ganador') cargarGanador();
}

// ========== CARGAR TODO AL INICIAR ==========
async function cargarTodo() {
    await cargarConfig();
    await cargarDatos();
    await cargarGanador();
}

// ========== CARGAR DATOS (VENTAS) ==========
async function cargarDatos() {
    try {
        // Resumen
        const resResumen = await fetch('/api/admin/resumen', {
            headers: { 'x-admin-pass': password }
        });
        const resumen = await resResumen.json();

        document.getElementById('stat-vendidos').textContent = resumen.vendidos || 0;
        document.getElementById('stat-disponibles').textContent = resumen.disponibles || 0;
        document.getElementById('stat-total').textContent = resumen.total || 100;
        document.getElementById('stat-recaudado').textContent = 
            '$' + ((resumen.recaudado || 0)).toLocaleString('es-CO');

        // Ventas agrupadas
        const resVentas = await fetch('/api/admin/ventas', {
            headers: { 'x-admin-pass': password }
        });
        ventasCache = await resVentas.json();

        renderizarVentas(ventasCache);

    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

// ========== RENDERIZAR TABLA DE VENTAS ==========
function renderizarVentas(ventas) {
    const tbody = document.getElementById('tabla-ventas-body');
    tbody.innerHTML = '';

    if (!ventas || ventas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="sin-ventas">No hay ventas registradas</td></tr>';
        return;
    }

    ventas.forEach(v => {
        const numeros = (v.numeros || '').split(',').filter(n => n !== '');
        const tr = document.createElement('tr');

        // Números como badges
        const numerosHTML = numeros.map(n => 
            `<span class="num-badge">${n}</span>`
        ).join('');

        tr.innerHTML = `
            <td>
                <div class="numeros-lista">
                    ${numerosHTML}
                    <span class="badge-cantidad">${numeros.length} ${numeros.length === 1 ? 'boleta' : 'boletas'}</span>
                </div>
            </td>
            <td>${v.nombre || '-'}</td>
            <td>${v.telefono || '-'}</td>
            <td>${v.fecha || '-'}</td>
            <td>
                <button class="btn-liberar" onclick="liberarGrupo('${v.grupo}', '${numeros.length}')">
                    Liberar ${numeros.length}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ========== BUSCADOR ==========
function filtrarVentas() {
    const termino = document.getElementById('buscador').value.toLowerCase().trim();

    if (!termino) {
        renderizarVentas(ventasCache);
        return;
    }

    const filtradas = ventasCache.filter(v => {
        const nombre = (v.nombre || '').toLowerCase();
        const telefono = (v.telefono || '').toLowerCase();
        const numeros = (v.numeros || '').toLowerCase();

        return nombre.includes(termino) || 
               telefono.includes(termino) || 
               numeros.includes(termino);
    });

    renderizarVentas(filtradas);
}

// ========== LIBERAR GRUPO COMPLETO ==========
async function liberarGrupo(grupo, cantidad) {
    if (!confirm(`¿Seguro que quieres liberar los ${cantidad} números de esta venta?`)) {
        return;
    }

    try {
        const res = await fetch('/api/admin/liberar-grupo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-pass': password
            },
            body: JSON.stringify({ grupo })
        });
        const data = await res.json();
        if (data.success) {
            cargarDatos();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error al liberar los números');
    }
}

// ========== EXPORTAR CSV ==========
function exportarCSV() {
    const url = `/api/admin/exportar?pass=${encodeURIComponent(password)}`;
    window.open(url, '_blank');
}

// ========== CONFIGURACIÓN ==========
async function cargarConfig() {
    try {
        const res = await fetch('/api/admin/config', {
            headers: { 'x-admin-pass': password }
        });
        configActual = await res.json();

        document.getElementById('cfg-nombre').value = configActual.nombre_rifa || '';
        document.getElementById('cfg-premio').value = configActual.premio || '';
        document.getElementById('cfg-precio').value = configActual.precio || '';
        document.getElementById('cfg-fecha').value = configActual.fecha_rifa || '';
        document.getElementById('cfg-loteria').value = configActual.loteria || '';
        document.getElementById('cfg-nequi').value = configActual.nequi || '';
        document.getElementById('cfg-titular').value = configActual.titular || '';

        const toggle = document.getElementById('toggle-cerrar');
        if (configActual.rifa_cerrada === 'true') {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }

    } catch (error) {
        console.error('Error cargando config:', error);
    }
}

async function guardarConfig() {
    const nuevaConfig = {
        nombre_rifa: document.getElementById('cfg-nombre').value.trim(),
        premio: document.getElementById('cfg-premio').value.trim(),
        precio: document.getElementById('cfg-precio').value.trim(),
        fecha_rifa: document.getElementById('cfg-fecha').value.trim(),
        loteria: document.getElementById('cfg-loteria').value.trim(),
        nequi: document.getElementById('cfg-nequi').value.trim(),
        titular: document.getElementById('cfg-titular').value.trim(),
        rifa_cerrada: configActual.rifa_cerrada || 'false'
    };

    if (!nuevaConfig.nombre_rifa || !nuevaConfig.precio) {
        alert('El nombre de la rifa y el precio son obligatorios');
        return;
    }

    try {
        const res = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-pass': password
            },
            body: JSON.stringify(nuevaConfig)
        });
        const data = await res.json();
        if (data.success) {
            configActual = nuevaConfig;
            alert('✅ Configuración guardada. Los cambios ya se ven en la página pública.');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error guardando la configuración');
    }
}

function toggleCerrarRifa() {
    const toggle = document.getElementById('toggle-cerrar');
    toggle.classList.toggle('active');
    
    const cerrada = toggle.classList.contains('active');
    configActual.rifa_cerrada = cerrada ? 'true' : 'false';

    // Guardar automáticamente
    fetch('/api/admin/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-pass': password
        },
        body: JSON.stringify({ rifa_cerrada: configActual.rifa_cerrada })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            console.log('Rifa ' + (cerrada ? 'cerrada' : 'abierta'));
        }
    }).catch(err => console.error(err));
}

// ========== GANADOR ==========
async function cargarGanador() {
    try {
        const res = await fetch('/api/admin/ganador', {
            headers: { 'x-admin-pass': password }
        });
        ganadorActual = await res.json();

        const container = document.getElementById('ganador-card-container');
        const alerta = document.getElementById('alerta-ganador');
        const btnGuardar = document.querySelector('#tab-ganador .btn-guardar');

        if (ganadorActual && ganadorActual.numero) {
            // Ya hay ganador
            alerta.classList.add('active');
            if (btnGuardar) btnGuardar.style.display = 'none';

            document.getElementById('ganador-numero').value = ganadorActual.numero;
            document.getElementById('ganador-premio').value = ganadorActual.premio || '';
            document.getElementById('ganador-fecha').value = ganadorActual.fecha_sorteo || '';
            document.getElementById('ganador-numero').disabled = true;
            document.getElementById('ganador-premio').disabled = true;
            document.getElementById('ganador-fecha').disabled = true;

            container.innerHTML = `
                <div class="ganador-card">
                    <h3>🏆 ¡NÚMERO GANADOR! 🏆</h3>
                    <div class="numero-grande">${ganadorActual.numero}</div>
                    ${ganadorActual.premio ? `<p style="color:white; font-size:1.1rem;">Premio: ${ganadorActual.premio}</p>` : ''}
                    ${ganadorActual.fecha_sorteo ? `<p style="color:white;">Sorteo: ${ganadorActual.fecha_sorteo}</p>` : ''}
                    <p style="color:white; font-size:0.9rem; margin-top:10px;">Publicado: ${ganadorActual.fecha_publicacion || ''}</p>
                    <button class="btn-eliminar-ganador" onclick="eliminarGanador()">🗑️ Eliminar Ganador</button>
                </div>
            `;
        } else {
            // No hay ganador
            alerta.classList.remove('active');
            container.innerHTML = '';
            if (btnGuardar) btnGuardar.style.display = 'block';
            document.getElementById('ganador-numero').disabled = false;
            document.getElementById('ganador-premio').disabled = false;
            document.getElementById('ganador-fecha').disabled = false;
            document.getElementById('ganador-numero').value = '';
            document.getElementById('ganador-premio').value = '';
            document.getElementById('ganador-fecha').value = '';
        }

    } catch (error) {
        console.error('Error cargando ganador:', error);
    }
}

async function guardarGanador() {
    const numero = document.getElementById('ganador-numero').value.trim();
    const premio = document.getElementById('ganador-premio').value.trim();
    const fecha = document.getElementById('ganador-fecha').value.trim();

    if (!numero) {
        alert('Debes ingresar el número ganador');
        return;
    }

    if (numero.length > 2) {
        alert('El número debe ser de máximo 2 dígitos (ej: 07)');
        return;
    }

    if (!confirm(`¿Registrar el número ${numero} como ganador? Esto se mostrará en la página pública.`)) {
        return;
    }

    try {
        const res = await fetch('/api/admin/ganador', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-pass': password
            },
            body: JSON.stringify({ numero, premio, fecha_sorteo: fecha })
        });
        const data = await res.json();
        if (data.success) {
            alert('🏆 Ganador registrado correctamente');
            cargarGanador();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error registrando el ganador');
    }
}

async function eliminarGanador() {
    if (!confirm('¿Eliminar el ganador? La página pública dejará de mostrar el banner del ganador.')) {
        return;
    }

    try {
        const res = await fetch('/api/admin/ganador/eliminar', {
            method: 'POST',
            headers: { 'x-admin-pass': password }
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Ganador eliminado');
            cargarGanador();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error eliminando el ganador');
    }
}

// ========== AUTO-LOGIN SI YA INICIÓ SESIÓN ==========
window.addEventListener('DOMContentLoaded', () => {
    const savedPass = sessionStorage.getItem('admin_pass');
    if (savedPass) {
        document.getElementById('password').value = savedPass;
        login();
    }
});