const router = require('express').Router()

let connectDB = require('../database.js')

const { ObjectId } = require('mongodb')
const passport = require('passport')

let db
connectDB.then((client)=>{
  console.log('DB연결성공')
  db = client.db('forum')
}).catch((err)=>{
  console.log(err)
}) 

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

router.get('/write',checkLogin,(요청,응답) =>{
    try{
      응답.render('write.ejs',{user: 요청.user})
    }
    catch(e){
      console.log(e)
      응답.status(500).send('오류')
    }
});

router.post('/add', checkLogin, async (요청,응답) =>{
    try{
      if(요청.body.title == '' || 요청.body.content == '' || 요청.body.content == null) {
        응답.status(400).send('제목 및 내용을 적으세요')
      }else if(요청.body.title.length > 50){
        응답.status(400).send('제목이 너무 길어요')
      }else{
          let date = time()
          let 순서 = await db.collection('post').countDocuments({})
          await db.collection('post').insertOne({
          title : 요청.body.title, content : 요청.body.content , date : date, count : 순서, edit : 0, user_id : new ObjectId(요청.user._id), username : 요청.user.username})
          응답.redirect('/list/1')
      };
    }catch(e){
      console.log(e)
      응답.status(500).send('오류')
    }
});

router.get('/detail/:id', async(요청,응답)=>{
  try {
    let result = await db.collection('post').findOne({ _id : new ObjectId(요청.params.id)})
    let comment = await db.collection('comment').find({ parent_id : new ObjectId(요청.params.id)}).toArray()
    if (result == null) {
      응답.status(400).send('게시물이 존재하지 않습니다')
    }else{
      응답.render('detail.ejs', { result : result , user : 요청.user, comment : comment})
    }
  } catch (e){
    console.log(e)
    응답.status(500).send('오류')
  }
});

router.get('/edit/:id', checkLogin, async(요청,응답)=>{
    try {
      let result = await db.collection('post').findOne({ _id : new ObjectId(요청.params.id)})
      let user = 요청.user
      if (result == null) {
        응답.status(400).send('게시물이 존재하지 않습니다')
      } else if(user._id.equals(result.user_id) == false){
        응답.status(400).send('잘못된 경로입니다')
      } else{
        응답.render('edit.ejs', { result : result, user : user })
      }
    } catch (e){
      console.log(e)
      응답.status(500).send('오류')
    }
});

router.put('/edit/:id', checkLogin, async(요청,응답)=>{
  try{
    let result = await db.collection('post').findOne({ _id : new ObjectId(요청.params.id)})
    if (result == null) {
      응답.status(400).send('게시물이 이미 존재하지 않습니다')
    } else if(요청.body.title == '' || 요청.body.content == '' || 요청.body.content == null){
      응답.status(400).send('제목 및 내용을 적으세요')
    } else if(요청.body.title.length > 50){
      응답.status(400).send('제목이 너무 길어요')
    } else if(요청.user._id.equals(result.user_id) == false){
      응답.status(400).send('잘못된 경로입니다')
    } else {
      let edit = result.edit + 1
      await db.collection('post').updateOne({_id : new ObjectId(result._id) , user_id : new ObjectId(요청.user._id)},{$set:{title:요청.body.title,content:요청.body.content,edit:edit}})
      응답.redirect('/list/1')
    }
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
});
  
router.delete('/doc/:id', checkLogin, async(요청,응답)=>{
    try{
      let result = await db.collection('post').findOne({ _id : new ObjectId(요청.params.id)})
      if (result == null) {
        응답.status(400).send('게시물이 이미 존재하지 않습니다')
      } else if(요청.user._id.equals(result.user_id) == false){
        응답.status(400).send('잘못된 경로입니다')
      } else {
        await db.collection('post').deleteOne({
           _id : new ObjectId(result._id),
           user_id : new ObjectId(요청.user._id)
        })
        await db.collection('comment').deleteOne({
          parent_id : new ObjectId(result._id)
        })
        응답.redirect('/list/1')
      }
    }
    catch(e){
      console.log(e)
      응답.status(500).send('오류')
    }
});
router.post('/comment', checkLogin,async(요청,응답)=>{
  try{
    let result = await db.collection('post').findOne({ _id : new ObjectId(요청.body.parent_id)})
    if (result == null) {
      응답.status(400).send('게시물이 존재하지 않습니다')
    } else if(요청.user.username != 요청.body.username || 요청.user._id != 요청.body.user_id){
      응답.status(400).send('같은 계정이 아닙니다')
    } else if(요청.body.comment == ''){
      응답.status(400).send('댓글을 적으세요')
    } else {
      let date = time()
      await db.collection('comment').insertOne({
      parent_id : new ObjectId(result._id), user_id : new ObjectId(요청.user._id) , username : 요청.user.username , comment : 요청.body.comment, date : date})
      let data = await db.collection('comment').findOne({
      parent_id : new ObjectId(result._id), user_id : new ObjectId(요청.user._id) , username : 요청.user.username , comment : 요청.body.comment, date : date})
      응답.send(data)
    }
  }
  catch(e){
    console.log(e)
    응답.status(500).send('오류')
  }
})

module.exports = router