const express = require('express')
const app = express()
const { ObjectId } = require('mongodb') 
const methodOverride = require('method-override')
const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
const { MongoClient } = require("mongodb");
require('dotenv').config()
const { createServer } = require('http');
const { Server } = require('socket.io');
const server = createServer(app);
const io = new Server(server) 
const url = process.env.DB_URL

app.use(passport.initialize())
app.use(session({
  secret: process.env.SECRET,
  resave : false,
  saveUninitialized : false,
  cookie :{maxAge:1000 * 60 * 60 * 24 * 20},
  store: MongoStore.create({
    mongoUrl : url,
    dbName: 'forum',
  })
}))
app.use(passport.session())
app.use(methodOverride('_method')) 
app.set('view engine', 'ejs')
app.use(express.static(__dirname + '/public/'));
app.use(express.json())
app.use(express.urlencoded({extended:true})) 

let connectDB = require('./database.js')
const { search } = require('./routes/post.js')

let db;
connectDB.then((client)=>{
  console.log('DB연결성공')
  db = client.db('forum')
  server.listen(process.env.PORT, () => {
    console.log('http://localhost:8080 에서 서버 실행중')
  })
}).catch((err)=>{
  console.log(err)
})

passport.use(new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
  try{
    let result = await db.collection('user').findOne({ username : 입력한아이디})
    if (!result) {
      return cb(null, false, { message: '아이디가 존재하지 않습니다' })
    }
    if (await bcrypt.compare(입력한비번,result.password)) {
      return cb(null, result)
    } else {
      return cb(null, false, { message: '비번불일치' });
    }
  }
  catch(e){
    console.log(e)
  }
}))

passport.serializeUser((user, done) => {
  process.nextTick(() => {
    done(null, { id: user._id, username: user.username })
  })
})

passport.deserializeUser(async(user, done) => {
  let result = await db.collection('user').findOne({_id : new ObjectId(user.id) })
  delete result.password
  process.nextTick(() => {
    return done(null, result)
  })
})

function checkLogin(요청, 응답, next){
  if(요청.user){
    next()
  } else {
    응답.status(400).send('로그인 하세요')
  }
}

function time(){
  let today = new Date();
  let year = today.getFullYear(); // 년도
  let month = today.getMonth() + 1;  // 월
  let dates = today.getDate();  // 날짜
  let 시간 = today.toLocaleTimeString()
  let date = year + '-' + month + '-' + dates +' '+ 시간
  return date
}

app.use('/', require('./routes/post.js') )

app.get('/', (요청, 응답) => {
  try{
    응답.render('home.ejs' ,{user:요청.user})
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

app.get('/register', async(요청, 응답)=>{
  try{
    let findusername = await db.collection('user').find({}).project({ _id: 0, username: 1 }).toArray((err, users) => {
    if (err) {
      console.error('데이터 조회 오류:', err);
      return;
    }});
  let arr = [];
  for(let i of findusername){
    arr.push(i.username)
  }
  응답.render('register.ejs',{user:arr})
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

app.post('/register', async (요청, 응답) => {
  try{
    let findusername = await db.collection('user').find({}).project({ _id: 0, username: 1 }).toArray((err, users) => {
    if (err) {
        console.error('데이터 조회 오류:', err);
        return;
    }});
    if(요청.body.username == ''|| 요청.body.password == ''|| 요청.body.password2 == ''){
      응답.status(400).send('다시 적으세요')
    }
    else if(요청.body.username.length>13){
      응답.status(400).send('아이디가 너무 깁니다')
    }
    else if(요청.body.username.length<2){
      응답.status(400).send('아이디가 짧습니다')
    }
    else if(요청.body.password.length < 8){
      응답.status(400).send(' 비밀번호가 너무 짧습니다')
    }
    else if(요청.body.password != 요청.body.password2){
      응답.status(400).send('비밀번호를 다시 확인하세요')
    }
    else if(/[a-zA-Z]/.test(요청.body.password) == false){
      응답.status(400).send('영어를 포함하세요')
    }
    else if(/[0-9]/g.test(요청.body.password) == false){
      응답.status(400).send('숫자를 포함하세요')
    }
    else if(/\s/g.test(요청.body.password) == true && /\s/g.test(요청.body.username) == true){
      응답.status(400).send('띄어쓰기를 하지마세요')
    }
    else{
      let 중복확인 = findusername.some(name => {
        if(name.username == 요청.body.username) return true
        else return false
      });
      if(중복확인 == false){
        let 해싱 = await bcrypt.hash(요청.body.password, 10) 
        await db.collection('user').insertOne({
        username : 요청.body.username,
        password : 해싱
      })
      }
      else{
        응답.status(400).send('아이디가 같습니다')
      }
    }
    응답.redirect('/')
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
});

app.get('/login', (요청, 응답)=>{
  try{
      응답.render('login.ejs')
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
});

app.post('/login', async (요청, 응답, next) => {
  try{
    passport.authenticate('local', (error, user, info) => {
      if (error) return 응답.status(500).json(error)
      if (!user) return 응답.status(401).send('아이디 및 비번이 틀렸습니다')
      요청.logIn(user, (err) => {
        if (err) return next(err)
        응답.redirect('/')
      })
    })(요청, 응답, next)
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

app.get('/logout', function (req, res){
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.delete('/accountdelete',checkLogin, async (요청, 응답) => {
  try{
    let result = await db.collection('user').findOne({ _id : new ObjectId(요청.user._id)})
    if(result == null){
      응답.status(400).send('계정이 존재하지 않습니다')
    }
    else{
      await db.collection('user').deleteOne({ _id : new ObjectId(result._id)})
      요청.session.destroy(() => {
        응답.clearCookie('connect.sid');
        응답.redirect('/');
      });
    }
  }catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

app.get('/list/:id', async(요청, 응답) => {
  try{
    if(요청.query.val == undefined){
      let 개수 = await db.collection('post').countDocuments({})
      let 제한 = 12;
      if((개수 - (Number(요청.params.id))*12) < 0){
        제한 = 12+(개수 - (Number(요청.params.id))*12)
        if(제한 <= 0){
          제한 = 0
        }
      }else{
        제한 = 12
      }
      let result = await db.collection('post').find({count : { $gte : 개수 - (Number(요청.params.id))*12 }}).limit(제한).toArray()
      if((개수 - (Number(요청.params.id))*12) <= -12){
        result = []
      }
      응답.render('list.ejs', {result : result , 개수 : 개수 , user : 요청.user , search:0})
    }
    // 
    else{
      if(요청.query.val ==''){
        응답.redirect('/list/1')
      }
      else{
      let 검색조건 = [
        {$search : {
          index : 'search_index',
          text : {
            query : 요청.query.val, 
            path: ["title", "content"]
           }
        }},
      ]
      let result = await db.collection('post').aggregate(검색조건).toArray()
      let 개수 = result.length
      let 제한 = 12;
      let 스킵 = 개수 - (Number(요청.query.p))*12
      if((개수 - (Number(요청.query.p))*12) < 0){
        제한 = 12+(개수 - (Number(요청.query.p))*12)
        스킵 = 0
        if(제한 <= 0){
          제한 = 1
        }
      }else{
        제한 = 12
      }
      let 검색조건2 = [
        {$search : {
          index : 'search_index',
          text : { 
            query : 요청.query.val, 
            path: ["title", "content"]
          }
        }},
        { $sort : { _id : 1 } },
        { $skip : 스킵},
        { $limit : 제한 },
      ]
      result = await db.collection('post').aggregate(검색조건2).toArray()
      if((개수 - (Number(요청.query.p))*12) <= -12){
        result = []
      }
      응답.render('list.ejs', { result : result , user : 요청.user, 개수 : 개수 , search: 요청.query.val})
    }
    }
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

app.get('/setting',checkLogin,async(요청,응답)=>{
  try{
    응답.render('setting.ejs', { user : 요청.user })
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
});

app.post('/setting', checkLogin,async(요청,응답)=>{
  try{
    응답.render('setting.ejs', { user : 요청.user })
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
});

app.get('/chat/request',checkLogin ,async(요청,응답)=>{
  try{
    let result = await db.collection('groupchat').findOne({participant_id : {$all:[new ObjectId(요청.user._id) , new ObjectId(요청.query.writerId)]}})
    let find = await db.collection('user').findOne({ _id : new ObjectId(요청.query.writerId)})
    if(요청.user._id == 요청.query.writerId){
      응답.status(400).send('같은 계정입니다')
    }else if(find == null){
      응답.status(400).send('존재하지 않는 계정입니다')
    }else if(result == null){
      let date = time()
      let chat = await db.collection('groupchat').insertOne({
        participant_id : [new ObjectId(요청.user._id),new ObjectId(요청.query.writerId)] , participant_name : [요청.user.username,find.username] , date: date})
      응답.redirect(`/chatting/${chat._id}`)
    } else {
      응답.redirect(`/chatting/${result._id}`)
    }
  }catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

app.get('/chat' ,checkLogin ,async(요청,응답)=>{
  try{
    let result = await db.collection('groupchat').find({participant_id : new ObjectId(요청.user._id)}).toArray()
    let user = 요청.user
    if(result == null){
      result = []
      응답.render('chat.ejs', { user : user , result : result})
    } else {
      응답.render('chat.ejs', { user : user , result : result})
    }
  }catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
});

app.get('/chatting/:id' ,checkLogin ,async(요청,응답)=>{
  try{
    let user = 요청.user
    let result = await db.collection('groupchat').find({participant_id : new ObjectId(요청.user._id)}).toArray()
    let result2 = await db.collection('groupchat').findOne({_id : new ObjectId(요청.params.id)})
    let chat = await db.collection('chatting').find({parent_id : new ObjectId(요청.params.id)}).toArray()
    if(result2 == null){
      응답.status(400).send('채팅방이 존재하지 않습니다')
    }else{
      let 계정확인 = result2.participant_id.some(id => {
        if(id.equals(user._id)) return true
        else return false
      } );
      if(계정확인){
        응답.render('chatting.ejs', {result : result, result2 : result2, chat : chat, user: user })
      }
      else{
        응답.status(400).send('잘못된 경로입니다')
      }
    }

  }catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

io.on('connection', (socket) => {
  console.log('websocket 연결됨')
  socket.on('room-join', async (data) => {
    socket.join(data)
  })
  socket.on('message', async (data) => {
    try{
      let date = time()
      await db.collection('chatting').insertOne({
      parent_id : new ObjectId(data.room), user_id : new ObjectId(data.user_id) , username : data.username , chatting : data.msg, date : date});
    }catch(e){
      console.log(e)
    }
    io.to(data.room).emit('broadcast', data.msg);
  })
})