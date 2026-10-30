let seleccionados = [];
let PRECIO = 2000;
let config = {};

// ========== CARGAR CONFIGURACIÓN ==========
async function cargarConfig() {
    try {
        const res = await fetch('/api/config');
        config = await res.json();

        PRECIO = parseInt(config.precio) || 2000;

        // Actualizar textos de la página
        document.getElementById('nombre-rifa').textContent = 
            '🎉 ' + (config.nombre_rifa || 'SÚPER GRAN RIFA') + ' 🎉';
        document.getElementById('precio-boleto').textContent = 
            '$' + PRECIO.toLocaleString('es-CO');
        document.getElementById('premio-rifa').textContent = 
            config.premio || '$100.000';
        document.getElementById('fecha-rifa').textContent = 
            config.fecha_rifa || '15 de Octubre';
        document.getElementById('loteria-rifa').textContent = 
            config.loteria || 'Sinuano Noche';
        document.getElementById('nequi-config').textContent = 
            config.nequi || '3024130451';
        document.getElementById('titular-config').textContent = 
            config.titular || 'Yoser Fuentes';

        // Si la rifa está cerrada, ocultar formulario
        if (config.rifa_cerrada === 'true') {
            document.getElementById('formulario-compra').style.display = 'none';
            document.getElementById('rifa-cerrada').style.display = 'block';
        } else {
            document.getElementById('formulario-compra').style.display = 'block';
            document.getElementById('rifa-cerrada').style.display = 'none';
        }

    } catch (error) {
        console.error('Error cargando config:', error);
    }
}

// ========== CARGAR GANADOR ==========
async function cargarGanador() {
    try {
        const res = await fetch('/api/ganador');
        const ganador = await res.json();

        const banner = document.getElementById('banner-ganador');

        if (ganador && ganador.numero) {
            banner.style.display = 'block';
            document.getElementById('numero-ganador').textContent = ganador.numero;

            let info = '';
            if (ganador.premio) info += `Premio: ${ganador.premio}`;
            if (ganador.fecha_sorteo) {
                if (info) info += ' | ';
                info += `Sorteo: ${ganador.fecha_sorteo}`;
            }
            document.getElementById('info-ganador').textContent = info;
        } else {
            banner.style.display = 'none';
        }

    } catch (error) {
        console.error('Error cargando ganador:', error);
    }
}

// ========== CARGAR TABLA DE NÚMEROS ==========
async function cargarTabla() {
    try {
        const res = await fetch('/api/numeros');
        const datos = await res.json();
        const contenedor = document.getElementById('tabla');
        contenedor.innerHTML = '';

        datos.forEach(item => {
            const div = document.createElement('div');
            div.className = 'numero';
            div.textContent = item.numero;
            div.dataset.numero = item.numero;

            if (item.estado === 'reservado') {
                div.classList.add('vendido');
                div.title = `Vendido a: ${item.nombre || 'N/A'}`;
            } else {
                div.onclick = () => toggleSeleccion(item.numero, div);
                if (seleccionados.includes(item.numero)) {
                    div.classList.add('seleccionado');
                }
            }

            contenedor.appendChild(div);
        });
    } catch (error) {
        console.error("Error cargando tabla:", error);
    }
}

// ========== SELECCIONAR / DESELECCIONAR NÚMERO ==========
function toggleSeleccion(num, elemento) {
    if (config.rifa_cerrada === 'true') return;
    
    if (seleccionados.includes(num)) {
        seleccionados = seleccionados.filter(n => n !== num);
        elemento.classList.remove('seleccionado');
    } else {
        seleccionados.push(num);
        elemento.classList.add('seleccionado');
    }
    actualizarResumen();
}

// ========== ACTUALIZAR RESUMEN ==========
function actualizarResumen() {
    const lista = document.getElementById('lista-seleccionados');
    const total = document.getElementById('total');
    
    lista.textContent = seleccionados.length > 0 
        ? seleccionados.sort().join(', ') 
        : 'Ninguno';
    total.textContent = `$${(seleccionados.length * PRECIO).toLocaleString('es-CO')}`;
}

// ========== ENVIAR COMPRA ==========
async function enviarCompra() {
    const nombre = document.getElementById('nombre').value.trim();
    const telefono = document.getElementById('telefono').value.trim();

    if (!nombre || !telefono) {
        mostrarModal("⚠️ Datos incompletos", "Por favor completa tu nombre y teléfono.");
        return;
    }

    if (seleccionados.length === 0) {
        mostrarModal("⚠️ Sin números", "Por favor selecciona al menos un número.");
        return;
    }

    const btn = document.getElementById('btn-comprar');
    btn.disabled = true;
    btn.textContent = "Procesando...";

    try {
        const res = await fetch('/api/comprar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                numeros: seleccionados,
                nombre: nombre,
                telefono: telefono
            })
        });

        const resultado = await res.json();

        if (resultado.success) {
            mostrarModal(
                "✅ ¡Reserva Exitosa!",
                `Tus números: ${seleccionados.join(', ')}\nTotal: $${(seleccionados.length * PRECIO).toLocaleString('es-CO')}\n\nAhora envía el comprobante de pago al Nequi ${config.nequi || '3024130451'} (${config.titular || 'Yoser Fuentes'}).`
            );
            seleccionados = [];
            actualizarResumen();
            document.getElementById('nombre').value = '';
            document.getElementById('telefono').value = '';
            cargarTabla();
        } else {
            mostrarModal("❌ Error", resultado.message);
            cargarTabla();
        }
    } catch (error) {
        console.error(error);
        mostrarModal("❌ Error", "No se pudo conectar con el servidor.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Reservar Boletas";
    }
}

// ========== MODAL ==========
function mostrarModal(titulo, mensaje) {
    document.getElementById('modal-titulo').textContent = titulo;
    document.getElementById('modal-mensaje').innerText = mensaje;
    document.getElementById('modal').classList.add('active');
}

function cerrarModal() {
    document.getElementById('modal').classList.remove('active');
}

// ========== INICIAR ==========
async function iniciar() {
    await cargarConfig();
    await cargarGanador();
    await cargarTabla();

    // Actualizar cada 10 segundos
    setInterval(cargarTabla, 10000);
    setInterval(cargarGanador, 30000);
    setInterval(cargarConfig, 60000);
}

iniciar();