//Fail safe
process.on('uncaughtException', function (err) {
    console.error('uncaughtException',err);
});
//variables
var https = require('https');
var http = require('http');
var moment = require('moment');
var exec = require('child_process').exec;
var express = require('express');
var nodemailer = require('nodemailer');
var fs = require('fs');
var nedb = require('nedb')
var app = express()
var config = require('./conf.json')
var bodyParser = require('body-parser')
var jsonfile = require('jsonfile')
var cameraBrands=null;
if(!config.port){config.port=80}
if(!config.adminIP){config.adminIP=[]}
if(config.mail){
    var nodemailer = require('nodemailer').createTransport(config.mail);
}
s={cachedCameras:{},s:JSON.stringify};
//vars
s.database={}
try{
    s.database.articles=require('./database/articles.json')
}catch(err){
    s.database.articles={}
}
s.searchArticles=function(searchFor){
    var arr=[]
    Object.keys(s.database.articles).forEach(function(n,v){
        v = s.database.articles[n]
        var date = moment(v.date).format('YYYY-MM-DD')
        if(!searchFor||searchFor===''||JSON.stringify(v).toLowerCase().indexOf(searchFor)>-1){
           arr.push(v)
        }
    })
    return arr.reverse()
}
s.getNumberOfArticles=function(number){
    var arr={}
    var articles=Object.keys(s.database.articles).reverse()
    if(number!==0){
        articles=articles.slice(0,number)
    }
    articles.forEach(function(n,v){
        v = s.database.articles[n]
        arr[v.id]=v
    })
    return arr
}
s.sortArticles=function(){
    s.database.articlesSortedByDate={}
    s.database.articlesSortedByYearMonthOnly={}
    Object.keys(s.database.articles).forEach(function(n,v){
        v = s.database.articles[n]
        var date = moment(v.date).format('YYYY-MM-DD')
        var month = moment(v.date).format('MMMM')
        var year = moment(v.date).format('YYYY')

        //articles months by year
        if(!s.database.articlesSortedByYearMonthOnly[year])s.database.articlesSortedByYearMonthOnly[year]=[];
        if(s.database.articlesSortedByYearMonthOnly[year].indexOf(month)===-1)s.database.articlesSortedByYearMonthOnly[year].push(month);

        //articles by date
        if(!s.database.articlesSortedByDate[date])s.database.articlesSortedByDate[date]={};
        s.database.articlesSortedByDate[date][n] = v
    })
}
s.sortArticles()
s.database.contact = new nedb({ filename: __dirname+'/database/contact.json', autoload: true })
s.database.rebate = new nedb({ filename: __dirname+'/database/rebates.json', autoload: true })
s.database.returns = new nedb({ filename: __dirname+'/database/returns.json', autoload: true })
//functions
s.file_get_contents=function(target){
    return fs.readFileSync(target)
}
s.dir={
    web:__dirname+'/web',
    web_pages:__dirname+'/web/pages/',
    doc_pages:__dirname+'/web/docs/'
}
s.getCameraData=function(x,success,fail){
    var target;
    if(x!=='brands'){
        var target='cameras/'+x
    }else{
        var target='brands';
    }
    var href='https://raw.githubusercontent.com/ShinobiCCTV/cameraConnectionList/master/'+decodeURIComponent(target)+'.json';
    if(!s.cachedCameras[x]){
        https.request(href, function(data) {
            data.setEncoding('utf8');
            var chunks='';
            data.on('data', (chunk) => {
              chunks+=chunk;
            });
            data.on('end', () => {
              s.cachedCameras[x]=chunks;
              success(chunks)
            });
        }).on('error',fail).end();
    }else{
        success(s.cachedCameras[x])
    }
    
    return href;
}
s.getBrands=function(){
    s.getCameraData('brands',function(data){
    },function(er){
        if(er){
           s.getBrands()
        }
    })
}
s.getBrands()
s.authIP=function(req){
    req.body.ip=req.headers['cf-connecting-ip']||req.headers["CF-Connecting-IP"]||req.headers["'x-forwarded-for"]||req.connection.remoteAddress;
    req.ret={ok:false}
    var isAdmin=false
    config.adminIP.forEach(function(v){
        if(req.body.ip.indexOf(v)>-1){
            isAdmin=true
        }
    })
    return isAdmin
}
app.use('/', express.static(process.cwd() + '/web'));
app.set('views', __dirname + '/web');
app.set('view engine', 'ejs');
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
app.get('/.well-known/apple-developer-merchantid-domain-association', function(req, res) {
    res.sendFile(__dirname+'/web/verifiers/apple-developer-merchantid-domain-association')
})
//undefined
app.get(['/undefined','/robots.txt'], function(req, res) {
    res.end('')
});
//favicon
app.get('/favicon.ico', function(req, res) {
    fs.createReadStream(__dirname+'/web/libs/assets/icon/favicon.ico').pipe(res).end()
});
//search articles
app.get('/articles/search', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    req.ret={ok:false}
    if(s.authIP(req)===true){
        req.ret.ok=true
        req.ret.articles=s.searchArticles(req.query.search)
    }
    res.end(s.s(req.ret,null,3))
})
//reload articles
app.get('/articles/reload', function(req, res) {
    if(s.authIP(req)===true){
        s.database.articles=JSON.parse(fs.readFileSync('./database/articles.json','utf8'))
        s.sortArticles()
    }
    res.end('<script>location.href="/articles"</script>')
})
app.post('/articles/delete', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    req.ret={ok:false}
    if(s.authIP(req)===true){
        delete(s.database.articles[req.body.data.id])
        s.sortArticles()
        req.writeFile(function (err) {
            req.ret.ok=true;
            res.end(s.s(req.ret, null, 3));
        })
    }
    res.end(s.s(req.ret, null, 3));
})
app.post('/articles/:option', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if(s.authIP(req)===true){
        req.writeFile=function(cb){
            req.dir='./backups/';
            if (!fs.existsSync(req.dir)){
                fs.mkdirSync(req.dir);
            }
            exec('cp ./database/articles.json ./backups/articles-'+moment(new Date).format('YYYY-MM-DDTHH-mm-ss')+'.json')
            jsonfile.writeFile('./database/articles.json',s.database.articles,{spaces: 3}, cb)
        }
        req.body.data=JSON.parse(req.body.data)
        switch(req.params.option){
            case'delete':
                delete(s.database.articles[req.body.data.id])
                s.sortArticles()
                req.writeFile(function (err){
                    req.ret.ok=true;
                    res.end(s.s(req.ret, null, 3));
                })
            break;
            default:
                s.database.articles[req.body.data.id]=req.body.data;
                s.sortArticles()
                req.writeFile(function (err){
                    req.ret.ok=true;
                    req.ret.href='/articles/'+req.body.data.id;
                    if(err){
                        console.error(err)
                        req.ret.ok=false
                    }
                    res.end(s.s(req.ret, null, 3));
                })
            break;
         }
    }else{
        res.end(s.s(req.ret, null, 3));
    }
});
//donations
app.get('/getOnlineVisitors', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    var controller=http
    if(config.onlineVisitorsURL.indexOf('https://')>-1){
        controller=https
    }
    controller.request(config.onlineVisitorsURL, function(data) {
        data.setEncoding('utf8');
        var chunks='';
        data.on('data', (chunk) => {
          chunks+=chunk;
        });
        data.on('end', () => {
          res.end(chunks)
        });
    }).on('error',function(err){
        console.log(err)
    }).end();
})
//donations
app.get('/donations.json', function(req, res) {
    req.orders=[];
    req.run=function(x){
        http.request('http://billing.place/admin/api.php?api_id='+config.hostbill.id+'&api_key='+config.hostbill.key+'&call=getInvoices&list=paid', function(data) {
              data.setEncoding('utf8');
              req.chunks='';
              data.on('data', (chunk) => {
                  req.chunks+=chunk;
              });
              data.on('end', () => {
                try{req.chunks=JSON.parse(req.chunks);}catch(er){}
                req.orders=req.orders.concat(req.chunks.invoices)
//                if(req.chunks.sorter.totalpages>=req.chunks.sorter.sorterpage){
                    var x={};
                    x.total=0;
                    x.donationMax=600;
                    x.firstDay = new Date;
                    x.firstDay = new Date(x.firstDay.getFullYear(), x.firstDay.getMonth(), 1);
                    x.names=[]
                    req.orders.forEach(function(v,n){
                        if(moment(v.date).diff(moment(x.firstDay)) >= 0){
                            x.total+=parseFloat(v.total);
                            v.name=v.firstname+' '+v.lastname
                            if(x.names.indexOf(v.name)===-1){
                                x.names.push(v.name)
                            }
                        }
                    })
                    x.percent=x.total/x.donationMax*100
                    res.send(JSON.stringify(x))
//                }else{
//                    req.run(req.chunks.sorter.sorterpage+1)
//                }
              });

        }).on('error', function(e) {
            res.sendStatus(500);
        }).end();
    }
    req.run(1)
})
app.get('/data/cameras/:file', function(req, res) {
    res.set({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    })
    s.getCameraData(req.params.file,function(data){
        res.end(data)
    },function(){
        res.sendStatus(500);
    })
});
app.get('/data/:file', function(req, res) {
    req.file='data/'+req.params.file;
    fs.exists(req.file,function(exists){
        if(exists){
            fs.createReadStream(req.file).pipe(res).end()
        }else{
            res.send(JSON.stringify({ok:false,msg:'no file found'}));
            res.end();
        }
    })
    
});
app.get(['/docs/cameras','/docs/cameras/:file'], function(req, res) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    s.getCameraData(req.params.file,function(data){
        res.render('docs/cameras',{config:config,pageData:data,currentBrand:req.params.file,cameraBrands:s.cachedCameras.brands});
    },function(){
        res.sendStatus(500);
    })
})
app.get(['/docs','/docs/:file'], function(req, res) {
    req.pageDataFile='web/data/'+req.params.file+'.json';
    if(req.params.file&&fs.existsSync(req.pageDataFile)){
       try{req.pageData=JSON.parse(fs.readFileSync(req.pageDataFile,'utf8'));}catch(err){console.log(err)}
    }
    if(req.params.file){
        req.file=req.params.file
    }else{
        req.file='index';
    }
    res.render('docs/'+req.file,{config:config,pageData:req.pageData});
});
app.get(['/','/:file','/:file/:option'], function(req, res) {
    req.pageDataFile='web/data/'+req.params.file+'.json';
    if(req.params.file&&fs.existsSync(req.pageDataFile)){
       try{req.pageData=JSON.parse(fs.readFileSync(req.pageDataFile,'utf8'));}catch(err){console.log(err)}
    }
    if(req.params.file&&req.params.file!=='cameras'){
        req.file=req.params.file
    }else{
        req.file='index';
    }
    req.data={config:config,pageData:req.pageData,file_get_contents:s.file_get_contents,__dirname:__dirname,option:req.params.option}
    switch(req.params.file){
        case'articles':
            req.data.articlesPosts=s.getNumberOfArticles(0)
            req.data.articlesMonthsbyYear=s.database.articlesSortedByYearMonthOnly
            req.data.isAuthorized=s.authIP(req)
        break;
    }
    res.render('pages/'+req.file,req.data);
});
app.post(['/:form','/shop/:form'],function(req,res){
    res.setHeader('Content-Type','application/json');
    req.reply=function(reply){
        res.end(s.s(reply, null, 3));
    }
    if(!s.database[req.params.form]){
        req.reply({ok:false,msg:'Not a valid form type'})
        return
    }
    Object.keys(req.body).forEach(function(v,n){
        if(!req.body[v]){return}
        req.body[v]=req.body[v].trim()
    })
    switch(req.params.form){
        case'contact':
            req.form={
                name:req.body.name,
                mail:req.body.mail,
                city:req.body.city,
                province:req.body.province,
                country:req.body.country,
                phone:req.body.phone,
                note:req.body.note
            }
        break;
        case'feature-request':
            req.form={
                name:req.body.name,
                mail:req.body.mail,
                country:req.body.country,
                title:req.body.title,
                note:req.body.note
            }
        break;
        default:
            req.form={
                orderID:req.body.orderID,
                mail:req.body.mail,
                name:req.body.name,
                address:req.body.address,
                city:req.body.city,
                province:req.body.province,
                country:req.body.country,
                phone:req.body.phone,
                note:req.body.note
            }
            if(req.form.orderID)req.form.orderID=req.body.orderID.replace(/ /g,'');
            req.checkValue=req.body.orderID;
        break;
    }
    if(req.body.orderID===''){
        req.reply({ok:false,msg:'Order ID cannot be empty'})
        return
    }
    if(req.body.name===''){
        req.reply({ok:false,msg:'Name cannot be empty'})
        return
    }
    if(req.body.mail===''){
        req.reply({ok:false,msg:'Email cannot be empty'})
        return
    }
    if(req.body.address&&req.body.address===''){
        req.reply({ok:false,msg:'Address cannot be empty'})
        return
    }
    if(req.body.city&&req.body.city===''){
        req.reply({ok:false,msg:'City cannot be empty'})
        return
    }
    if(req.body.province&&req.body.province===''){
        req.reply({ok:false,msg:'Province cannot be empty'})
        return
    }
    if(req.body.country&&req.body.country===''){
        req.reply({ok:false,msg:'Country cannot be empty'})
        return
    }
    if(req.body.phone&&req.body.phone===''){
        req.reply({ok:false,msg:'Phone cannot be empty'})
        return
    }
    req.next=function(){
        if(nodemailer){
            req.mailOptions = {
                from: '"ShinobiCCTV" <no-reply@shinobi.video>',
                to: config.mail.auth.user,
                subject: '"'+req.params.form+'" Request from '+req.form.name,
                html: '',
            };
            Object.keys(req.form).forEach(function(v,n){
                req.mailOptions.html+='<div><b>'+v+' :</b> '+req.form[v]+'</div>'
            })
            nodemailer.sendMail(req.mailOptions, (error, info) => {
                if (error) {
                    console.log(error)
                }
            });
        }
        req.reply({ok:true})
    }
    if(req.checkValue){
        s.database[req.params.form].find({orderID:new RegExp(req.checkValue, "g")}, function (err, docs) {
            if(docs.length===0){
                s.database[req.params.form].insert(req.form, function (err, newDoc) {
                    if(err)console.log(err);
                    req.next()
                });
            }else{
                req.reply({ok:false,msg:'Order ID Exists'})
            }
        });
    }else{
        req.next()
    }
})
//start server
app.listen(config.port,config.ip,function () {
  console.log('Website Loaded on port '+config.port)
});
exec('pm2 flush',{detached:true})
setTimeout(function(){
    exec('pm2 flush',{detached:true})
},60000*60*2)