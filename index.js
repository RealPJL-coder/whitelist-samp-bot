require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require("discord.js");

const required = ["BOT_TOKEN", "CLIENT_ID", "GUILD_ID", "STAFF_CHANNEL_ID"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Faltam variáveis no ambiente: ${missing.join(", ")}`);
  process.exit(1);
}

const dbPath = process.env.DB_PATH || "./whitelist.db";
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    samp_id TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'Pendente',
    created_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT
  )
`);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName("painel-whitelist")
    .setDescription("Publica o painel de registro SA-MP")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("buscar-whitelist")
    .setDescription("Busca um registro por nome, ID SA-MP ou code")
    .addStringOption(o => o.setName("consulta").setDescription("Nome, ID ou code").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("remover-whitelist")
    .setDescription("Remove um registro pelo ID SA-MP")
    .addStringOption(o => o.setName("id-samp").setDescription("ID SA-MP do registro").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

function gerarCode() {
  return "SAMP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function registroEmbed(row) {
  return new EmbedBuilder()
    .setColor(row.status === "Aprovado" ? 0x2ECC71 : row.status === "Reprovado" ? 0xE74C3C : 0xF1C40F)
    .setTitle("📋 Registro de whitelist SA-MP")
    .addFields(
      { name: "Nome", value: row.player_name, inline: true },
      { name: "ID SA-MP", value: row.samp_id, inline: true },
      { name: "Code", value: `\`${row.code}\``, inline: true },
      { name: "Status", value: row.status, inline: true },
      { name: "Data", value: new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) },
      { name: "Discord", value: `<@${row.discord_id}>` }
    )
    .setFooter({ text: `Registro #${row.id}` });
}

async function registrarComandos() {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands.map(c => c.toJSON()) }
  );
}

client.once("ready", () => {
  console.log(`Conectado como ${client.user.tag}`);
  console.log(`Banco de dados: ${path.resolve(dbPath)}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "painel-whitelist") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "Você precisa ser administrador para publicar o painel.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("📋 WHITELIST • SA-MP")
          .setDescription(
            "Clique no botão abaixo para registrar seu jogador.\n\n" +
            "• Informe seu nome no SA-MP.\n" +
            "• Informe seu ID numérico.\n" +
            "• A data e o code serão gerados automaticamente.\n" +
            "• O registro ficará pendente até a staff analisar."
          )
          .setFooter({ text: "Sistema de registro SA-MP" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("wl_registrar")
            .setLabel("Registrar jogador")
            .setEmoji("📝")
            .setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({ embeds: [embed], components: [row] });
      }

      if (interaction.commandName === "buscar-whitelist") {
        if (!isStaff(interaction)) {
          return interaction.reply({ content: "Você não tem permissão para usar este comando.", ephemeral: true });
        }
        const q = interaction.options.getString("consulta", true).trim();
        const row = db.prepare(`
          SELECT * FROM whitelist
          WHERE samp_id = ? OR code = ? OR player_name LIKE ?
          ORDER BY id DESC LIMIT 1
        `).get(q, q.toUpperCase(), `%${q}%`);

        if (!row) {
          return interaction.reply({ content: "Nenhum registro encontrado.", ephemeral: true });
        }
        return interaction.reply({ embeds: [registroEmbed(row)], ephemeral: true });
      }

      if (interaction.commandName === "remover-whitelist") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "Só administradores podem remover registros.", ephemeral: true });
        }
        const id = interaction.options.getString("id-samp", true).trim();
        const result = db.prepare("DELETE FROM whitelist WHERE samp_id = ?").run(id);
        return interaction.reply({
          content: result.changes
            ? `🗑️ Registro do ID SA-MP ${id} removido.`
            : `Não encontrei registro para o ID SA-MP ${id}.`,
          ephemeral: true
        });
      }
    }

    if (interaction.isButton() && interaction.customId === "wl_registrar") {
      const modal = new ModalBuilder()
        .setCustomId("wl_formulario")
        .setTitle("Registro SA-MP");

      const nome = new TextInputBuilder()
        .setCustomId("nome")
        .setLabel("Nome do jogador no SA-MP")
        .setPlaceholder("Ex.: Joao_Silva")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(32);

      const sampId = new TextInputBuilder()
        .setCustomId("samp_id")
        .setLabel("ID numérico no SA-MP")
        .setPlaceholder("Ex.: 125")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nome),
        new ActionRowBuilder().addComponents(sampId)
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "wl_formulario") {
      const nome = interaction.fields.getTextInputValue("nome").trim();
      const sampId = interaction.fields.getTextInputValue("samp_id").trim();

      if (!/^[A-Za-z0-9_ ]{3,32}$/.test(nome)) {
        return interaction.reply({ content: "Use um nome de 3 a 32 caracteres, com letras, números, espaços ou _.", ephemeral: true });
      }
      if (!/^[0-9]{1,10}$/.test(sampId)) {
        return interaction.reply({ content: "O ID SA-MP precisa conter apenas números.", ephemeral: true });
      }

      const duplicate = db.prepare("SELECT id FROM whitelist WHERE samp_id = ?").get(sampId);
      if (duplicate) {
        return interaction.reply({ content: "Esse ID SA-MP já possui um registro. Fale com a staff se precisar corrigir.", ephemeral: true });
      }

      let code;
      for (let i = 0; i < 5; i++) {
        const candidate = gerarCode();
        if (!db.prepare("SELECT id FROM whitelist WHERE code = ?").get(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        return interaction.reply({ content: "Não consegui gerar um code agora. Tente novamente.", ephemeral: true });
      }

      const createdAt = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO whitelist (discord_id, player_name, samp_id, code, status, created_at)
        VALUES (?, ?, ?, ?, 'Pendente', ?)
      `).run(interaction.user.id, nome, sampId, code, createdAt);

      const row = db.prepare("SELECT * FROM whitelist WHERE id = ?").get(result.lastInsertRowid);

      const staffChannel = await client.channels.fetch(process.env.STAFF_CHANNEL_ID);
      if (!staffChannel || !staffChannel.isTextBased() || !staffChannel.send) {
        return interaction.reply({
          content: `Seu registro foi salvo, mas não consegui avisar a staff. Guarde seu code: ${code} e avise um administrador.`,
          ephemeral: true
        });
      }

      await staffChannel.send({ embeds: [registroEmbed(row)] });
      return interaction.reply({
        content: `✅ Registro enviado para análise!\n**Nome:** ${nome}\n**ID SA-MP:** ${sampId}\n**Code:** \`${code}\`\n**Status:** Pendente`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("Erro na interação:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Ocorreu um erro. Avise a administração do servidor.", ephemeral: true }).catch(() => {});
    }
  }
});

async function main() {
  await registrarComandos();
  await client.login(process.env.BOT_TOKEN);
}

main().catch((error) => {
  console.error("Não foi possível iniciar o bot:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
