const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv'); // Importe a biblioteca dotenv
// Carregue as variáveis de ambiente do arquivo .env
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
    
      console.log(req.body)

    } catch (error) {
      console.error('Erro durante a adição dos valores:', error);
      res.status(500).send('Erro durante a adição dos valores');
    }
  });
  


  app.listen(port, () => {
    console.log(`Servidor está rodando em http://localhost:${port}`);
  });
});








