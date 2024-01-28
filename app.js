const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');

dotenv.config();

const app = express();
const port = 4323;

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Erro de conexão ao MongoDB:'));
db.once('open', () => {
  console.log('Conectado ao MongoDB sem especificar o banco de dados');
  // Especificar o banco de dados
  const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    pass: String,
    status_plan: String,
    instanciaName: String,
    instanciaApikey: String,
    retuneChat: String,
    retuneApikey: String,
  });

  const User = mongoose.model('User', UserSchema, 'users');

  // Registro de usuário
  app.post('/register', async (req, res) => {
    const { name, email, pass, status_plan } = req.body;

    // Hash da senha antes de salvar no banco de dados
    const hashedPassword = await bcrypt.hash(pass, 10);

    const newUser = new User({
      name,
      email,
      pass: hashedPassword,
      status_plan,
    });

    try {
      await newUser.save();
      res.status(201).send('Usuário registrado com sucesso');
    } catch (error) {
      res.status(500).send('Erro ao registrar o usuário');
    }
  });

  app.post('/login', async (req, res) => {
    const { email, pass } = req.body;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).send('Usuário não encontrado');
      }

      const isPasswordValid = await bcrypt.compare(pass, user.pass);

      if (!isPasswordValid) {
        return res.status(401).send('Senha inválida');
      }



      const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, {
        expiresIn: '1h',
      });


      const instancia = user.instanciaName
      const apikey = user.instanciaApikey


      res.status(200).json({ token, instancia, apikey });
    } catch (error) {
      res.status(500).send('Erro durante o login');
    }
  });


  app.post('/set-retune', async (req, res) => {
    const { instancia, apikey, chat, apikeyChat } = req.body;

    try {
      // Procurar o usuário com base nos valores de instancia e apikey
      const user = await User.findOne({ instanciaName: instancia, instanciaApikey: apikey });

      if (!user) {
        return res.status(404).send('Usuário não encontrado para a instância e apikey fornecidas');
      }

      // Adicionar os novos valores às colunas retuneChat e retuneApikey
      user.retuneChat = chat;
      user.retuneApikey = apikeyChat;

      // Salvar as alterações no banco de dados
      await user.save();

      res.status(200).json({ message: 'Valores adicionados com sucesso' });
    } catch (error) {
      console.error('Erro durante a adição dos valores:', error);
      res.status(500).send('Erro durante a adição dos valores');
    }
  });


  app.post('/webhooks/messages-upsert', async (req, res) => {
    try {
      let message;

      if (req.body.data.message.extendedTextMessage && req.body.data.message.extendedTextMessage.text) {
        message = req.body.data.message.extendedTextMessage.text;
      } else if (req.body.data.message.conversation) {
        message = req.body.data.message.conversation;
      }

      if (!message) {
        console.error('Mensagem não encontrada');
        res.status(400).send('Mensagem não encontrada');
        return;
      }

      let remoteid = req.body.data.key.remoteJid;
      let server_url = req.body.server_url;
      let apikey = req.body.apikey;
      let instancia = req.body.data.owner;

      // Procurar o usuário com base nos valores de instancia e apikey
      const user = await User.findOne({ instanciaName: instancia, instanciaApikey: apikey });

      if (!user) {
        return res.status(404).send('Usuário não encontrado para a instância e apikey fornecidas');
      }

      let chatRetune = user.retuneChat;
      let apikeyRetune = user.retuneApikey;
      let threadIdChat;

      let threadIdFile = `./src/retune/threadId/${instancia}/data.json`;

      try {
        const threadIdData = await fs.readFile(threadIdFile, 'utf8');
        const threadIdJson = JSON.parse(threadIdData);

        if (threadIdJson[remoteid]) {
          threadIdChat = threadIdJson[remoteid];
          console.log(`ThreadId encontrado para remoteid ${remoteid}: ${threadIdChat}`);

        } else {
          const retuneApiUrl = `https://retune.so/api/chat/${chatRetune}/new-thread`;
          const retuneHeaders = {
            'Content-Type': 'application/json',
            'X-Workspace-API-Key': apikeyRetune,
          };

          const retuneResponse = await axios.post(retuneApiUrl, {}, { headers: retuneHeaders });
          threadIdChat = retuneResponse.data.threadId;

          threadIdJson[remoteid] = threadIdChat;
          await fs.writeFile(threadIdFile, JSON.stringify(threadIdJson), 'utf8');

          console.log(`Novo threadId gerado para remoteid ${remoteid}: ${threadIdChat}`);
        }
      } catch (readError) {
        const retuneApiUrl = `https://retune.so/api/chat/${chatRetune}/new-thread`;
        const retuneHeaders = {
          'Content-Type': 'application/json',
          'X-Workspace-API-Key': apikeyRetune,
        };

        const retuneResponse = await axios.post(retuneApiUrl, {}, { headers: retuneHeaders });
        threadIdChat = retuneResponse.data.threadId;

        await fs.mkdir(path.dirname(threadIdFile), { recursive: true });
        await fs.writeFile(threadIdFile, JSON.stringify({ [remoteid]: threadIdChat }), 'utf8');

        console.log(`Novo threadId gerado para remoteid ${remoteid}: ${threadIdChat}`);
      }

      try {
        const retuneApiUrl = `https://retune.so/api/chat/${chatRetune}/response`;
        const retuneHeaders = {
          'Content-Type': 'application/json',
          'X-Workspace-API-Key': apikeyRetune,
        };

        const retuneRequestBody = {
          threadId: threadIdChat,
          input: message,
        };

        const retuneResponse = await axios.post(retuneApiUrl, retuneRequestBody, { headers: retuneHeaders });

        // Aqui você pode lidar com a resposta da segunda requisição
        console.log('Resposta da requisição para retune.so:', retuneResponse.data);





        try {
          const sendMessageUrl = `${server_url}/message/sendText/${instancia}`;
          const sendMessageHeaders = {
            'Content-Type': 'application/json',
            'apikey': apikey,
          };

          const sendMessageBody = {
            number: remoteid,
            options: {
              delay: 1200,
              presence: 'composing',
              linkPreview: false,
            },
            textMessage: {
              text: retuneResponse.data.response.value,
            },
          };

          const sendMessageResponse = await axios.post(sendMessageUrl, sendMessageBody, { headers: sendMessageHeaders });

          // Aqui você pode lidar com a resposta da terceira requisição
          console.log('Resposta da requisição para enviar mensagem:', sendMessageResponse.data);

          // Resto do seu código aqui...

        } catch (sendMessageError) {
          console.error('Erro durante a requisição para enviar mensagem:', sendMessageError);
          res.status(500).send('Erro durante a requisição para enviar mensagem');
        }




      } catch (retuneError) {
        console.error('Erro durante a requisição para retune.so:', retuneError);
        res.status(500).send('Erro durante a requisição para retune.so');
      }



    } catch (error) {
      console.error('Erro durante a adição dos valores:', error);
      res.status(500).send('Erro durante a adição dos valores');
    }
  });






  app.post('/historic', async (req, res) => {
    const { instancia, apikey } = req.body;

    try {

      // Fazendo a requisição usando axios
      const response = await axios.post(`https://evolution.dagestao.com/chat/findMessages/${instancia}`, {
        // Se houver dados adicionais a serem enviados no corpo da solicitação, adicione aqui
      }, {
        headers: {
          'apikey': apikey,
          'Content-Type': 'application/json',  // Defina o tipo de conteúdo conforme necessário
        },
      });

      // Se a solicitação for bem-sucedida, você pode acessar os dados de resposta
      const chat = response.data;

      //console.log(responseData)

      // Objeto para armazenar as mensagens agrupadas por remoteJid
      const chatsPorRemoteJid = {};

      // Itera sobre cada mensagem no chat
      chat.forEach((mensagem) => {
        // Verifica se a mensagem tem owner "Dev01"
        if (mensagem.owner === "Dev01") {
          // Obtém o remoteJid da mensagem
          const remoteJid = mensagem.key.remoteJid;

          // Cria um array para o remoteJid se ainda não existir
          chatsPorRemoteJid[remoteJid] = chatsPorRemoteJid[remoteJid] || [];

          // Adiciona a mensagem ao array correspondente ao remoteJid
          chatsPorRemoteJid[remoteJid].push(mensagem);
          //console.log(mensagem)
        }
      });

      console.log(chatsPorRemoteJid);


      res.status(200).json({ chatsPorRemoteJid });

    } catch (error) {
      res.status(500).send('Erro ao buscar o historico');
    }
  });



  app.listen(port, () => {
    console.log(`Servidor está rodando em http://localhost:${port}`);
  });
});








