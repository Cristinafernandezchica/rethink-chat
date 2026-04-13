import r from "rethinkdb";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

const DB_NAME = process.env.RETHINK_DB;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

async function resetDatabase() {
  console.log("\n🚀 ========================================");
  console.log("   REINICIANDO BASE DE DATOS");
  console.log("   ========================================\n");

  const conn = await r.connect({
    host: process.env.RETHINK_HOST,
    port: parseInt(process.env.RETHINK_PORT)
  });

  try {
    // 1. ELIMINAR BASE DE DATOS SI EXISTE
    const dbList = await r.dbList().run(conn);
    
    if (dbList.includes(DB_NAME)) {
      console.log(`🗑️ Eliminando base de datos: ${DB_NAME}`);
      await r.dbDrop(DB_NAME).run(conn);
      console.log(`✅ Base de datos eliminada: ${DB_NAME}\n`);
    } else {
      console.log(`ℹ️ La base de datos ${DB_NAME} no existía\n`);
    }

    // 2. CREAR BASE DE DATOS
    console.log(`📦 Creando base de datos: ${DB_NAME}`);
    await r.dbCreate(DB_NAME).run(conn);
    console.log(`✅ Base de datos creada: ${DB_NAME}\n`);

    // 3. CREAR TABLAS (incluyendo user_locations)
    console.log("📋 Creando tablas...");
    const tables = ["users", "messages", "private_messages", "alerts", "online_users", "user_locations"];

    for (const table of tables) {
      await r.db(DB_NAME).tableCreate(table).run(conn);
      console.log(`  ✅ Tabla creada: ${table}`);
    }
    console.log("");

    // 4. CREAR ÍNDICES
    console.log("🔍 Creando índices...");
    
    // Índices para messages
    await r.db(DB_NAME).table("messages").indexCreate("createdAt").run(conn);
    await r.db(DB_NAME).table("messages").indexCreate("search", r.row("text"), { multi: true }).run(conn);
    console.log("  ✅ Índices en 'messages'");
    
    // Índices para users
    await r.db(DB_NAME).table("users").indexCreate("username").run(conn);
    console.log("  ✅ Índice en 'users'");
    
    // Índices para online_users
    await r.db(DB_NAME).table("online_users").indexCreate("username").run(conn);
    console.log("  ✅ Índice en 'online_users'");
    
    // Índices para private_messages
    await r.db(DB_NAME).table("private_messages").indexCreate("createdAt").run(conn);
    await r.db(DB_NAME).table("private_messages").indexCreate("conversation", [r.row("from"), r.row("to")]).run(conn);
    console.log("  ✅ Índices en 'private_messages'");
    
    // Índices para alerts
    await r.db(DB_NAME).table("alerts").indexCreate("createdAt").run(conn);
    console.log("  ✅ Índice en 'alerts'");
    
    // ÍNDICES GEOESPACIALES para user_locations
    await r.db(DB_NAME).table("user_locations").indexCreate("location", { geo: true }).run(conn);
    await r.db(DB_NAME).table("user_locations").indexCreate("username").run(conn);
    await r.db(DB_NAME).table("user_locations").indexCreate("updatedAt").run(conn);
    console.log("  ✅ Índices geoespaciales en 'user_locations'");
    
    // Esperar índices
    await Promise.all([
      r.db(DB_NAME).table("messages").indexWait().run(conn),
      r.db(DB_NAME).table("users").indexWait().run(conn),
      r.db(DB_NAME).table("online_users").indexWait().run(conn),
      r.db(DB_NAME).table("private_messages").indexWait().run(conn),
      r.db(DB_NAME).table("alerts").indexWait().run(conn),
      r.db(DB_NAME).table("user_locations").indexWait().run(conn)
    ]);
    console.log("");

    // 5. CREAR USUARIO ADMINISTRADOR
    console.log("👑 Creando usuario administrador...");
    
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const adminId = r.uuid();
    
    await r.db(DB_NAME).table("users").insert({
      id: adminId,
      username: ADMIN_USERNAME,
      password: hashedPassword,
      role: "admin",
      createdAt: new Date(),
      isDefaultAdmin: true
    }).run(conn);
    
    console.log(`  ✅ Usuario admin creado: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}\n`);

    // 6. CREAR MENSAJES DE EJEMPLO
    console.log("💬 Creando mensajes de ejemplo...");
    
    const sampleMessages = [];
    const sampleTexts = [
      "🎉 ¡Bienvenido al chat! La base de datos ha sido reiniciada correctamente.",
      "✏️ Los mensajes se pueden editar: haz clic en el lápiz al pasar el mouse.",
      "🗑️ También se pueden eliminar: haz clic en el bote de basura.",
      "💬 Los mensajes privados funcionan haciendo clic en cualquier usuario.",
      "🔔 Los administradores pueden enviar alertas globales.",
      "📍 Comparte tu ubicación y usa el mapa para ver usuarios cercanos."
    ];
    
    for (let i = 0; i < sampleTexts.length; i++) {
      sampleMessages.push({
        id: r.uuid(),
        username: "system",
        text: sampleTexts[i],
        createdAt: new Date(Date.now() - i * 60000),
        edited: false,
        editHistory: [],
        deleted: false,
        originalText: null,
        lastEditedAt: null,
        lastEditedBy: null,
        deletedAt: null,
        deletedBy: null
      });
    }
    
    await r.db(DB_NAME).table("messages").insert(sampleMessages).run(conn);
    console.log(`  ✅ ${sampleMessages.length} mensajes de ejemplo creados\n`);

    // 7. VERIFICAR
    console.log("🔍 Verificando estado final...");
    
    const usersCount = await r.db(DB_NAME).table("users").count().run(conn);
    const messagesCount = await r.db(DB_NAME).table("messages").count().run(conn);
    const tablesList = await r.db(DB_NAME).tableList().run(conn);
    
    console.log(`\n📊 Estadísticas:`);
    console.log(`   Usuarios: ${usersCount}`);
    console.log(`   Mensajes: ${messagesCount}`);
    console.log(`   Tablas: ${tablesList.join(", ")}`);
    
    console.log("\n✨ ========================================");
    console.log("🎉 BASE DE DATOS REINICIADA CON ÉXITO");
    console.log("✨ ========================================\n");
    
    console.log("📝 Credenciales de acceso:");
    console.log(`   Usuario: ${ADMIN_USERNAME}`);
    console.log(`   Contraseña: ${ADMIN_PASSWORD}\n`);
    
    console.log("🌍 Funcionalidades disponibles:");
    console.log("   ✅ Chat en tiempo real");
    console.log("   ✅ Mensajes privados");
    console.log("   ✅ Edición y eliminación de mensajes");
    console.log("   ✅ Búsqueda en tiempo real");
    console.log("   ✅ Estadísticas con MapReduce");
    console.log("   ✅ Geolocalización y mapa de usuarios");

  } catch (err) {
    console.error("\n❌ ERROR durante el reinicio:");
    console.error(`   ${err.message}`);
  } finally {
    conn.close();
  }
}

resetDatabase();