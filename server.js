
var Koa = require('koa')
    , Router = require('@koa/router')
    , Event = require("events").EventEmitter
    , bodyParser = require('koa-bodyparser')
    , Asar = require("koa-asar")
    , path = require("path")
    , fs = require("fs").promises
    , cors = require('koa2-cors')
    , cServices={}
    ;

const { htmlPath, extendRouter, useAmisServer, useAuthenticate, Cloud, useUser } = require("@zsea/amis-server")
/**
 * 启动服务
 * @param {Object} options - 参数
 * @param {Linq2mysql} options.db - 数据库连接对象
 * @param {string} options.secret? - 生成JWT的Secret字符串
 * @param {number} options.port? - 运行端口
 * @param {string} options.cookieName? - 存储jwt的cookie name
 * @param {string[]} options.routers? - 自定义的路由对象
 */
async function Startup(options) {
    options = options || {};
    if (!options.db) {
        throw new Error('no db');
    }
    options.port = options.port || 8080;
    options.secret = options.secret || "hadmin";
    options.cookieName = options.cookieName || "h-token";
    options.routers = options.routers || [];
    options.logo = options.logo || path.join(__dirname, "logo.png");

    if(options.services){
        for (const sf of options.services) {
            let service_file = path.isAbsolute(sf) ? sf : path.join(process.cwd(), sf);
            const s=require(service_file);
            cServices[s.name]=s;
            s.Startup(options);
        }
    }

    extendRouter(Router, useAuthenticate(options.db), useUser(options.secret));
    var apiRouter = new Router({
        prefix: '/api/amis'
    });
    const watcher = new Event();
    const server = useAmisServer(apiRouter, options.db, options.secret, options.cookieName, watcher);

    var app = new Koa({
        proxy: options.proxy === true
    });
    app.use(bodyParser());
    if (options["log"]) {
        app.use(async function log(ctx, next) {
            try {
                await next();
            }
            catch (e) {
                console.error(e);

            }
            console.log(`[web] [${ctx.status}] - [${ctx.request.ip}] [${ctx.request.method}] ${ctx.request.URL.pathname}${ctx.request.URL.search}`)
        });
    }
    if (options["cors"] === true) {
        app.use(cors());
    }
    const logo = new Router();
    logo.get('/html/amis/logo.png', async function logo(ctx) {
        const png = options.logo;
        const content = await fs.readFile(png);
        ctx.body = content;
        const ext = path.extname(png);
        ctx.type = ext;
    });
    app.use(logo.routes());
    for (const router_file of options.router) {
        let router = path.isAbsolute(router_file) ? router_file : path.join(process.cwd(), router_file);
        const m = require(router);
        const itemRouter = m(Router, { db: options.db, dbs: options.dbs, }, { server: server, options: options }, useAuthenticate(options.db), useUser(options.secret, options.cookieName), watcher);
        server.appendRouter(itemRouter);
        app.use(itemRouter.routes());
    }

    const cloud = new Cloud();
    server.appendRouter(cloud);
    const m = await cloud.use({ db: options.db, dbs: options.dbs }, useAuthenticate(options.db), useUser(options.secret, options.cookieName), watcher);

    app.use(m);
    app.use(apiRouter.routes()).use(apiRouter.allowedMethods());
    app.use(Asar(htmlPath, { "root": "/html", index: "index.html", default: "master.html" }));
    app.listen(options.port,options.hostname, function (err) {
        if (err) {
            console.error('HAdmin server startup error', err);
            process.exit(1);
        }
        else {
            let hostname=options.hostname;
            if(hostname.includes(":")) hostname=`[${hostname}]`
            console.log(`[${process.pid}] HAdmin server startup in : ${hostname}:${options.port}`)
        }
    });
}

module.exports = {
    Startup
}