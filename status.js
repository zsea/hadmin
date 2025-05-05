const  os = require("os")
    , http = require("http")
    , Koa = require('koa')
    , Router = require("@koa/router")
    , bodyParser = require('koa-bodyparser')
    , path=require("path")
    , Transform = require('stream').Transform
    , Console = console.Console
    , spawn = require('child_process').spawn
    ;
let listen_host = {};
if (os.platform() === 'win32') {
    //listen_path = "\\\\.\\pipe\\hadmin_status";
    //listen_path = "127.0.0.2:8888";
    listen_host = {
        hostname: "127.0.0.2",
        port: 10308
    }
}
else {
    // listen_path = "/tmp/hadmin_status.sock";//测试使用抽象套接字名​​
    // if (fs.existsSync(listen_path)) {
    //     fs.unlinkSync(listen_path);
    // }
    listen_host = {
        hostname: "127.0.0.2",
        port: 10308
    }
}
/**
 * 
 * pid:主进程ID
 * workers:workers参数的值
 * port:监听的端口
 * name:服务名称
 * debug:是否开启debug
 * cors:是否允许跨域
 * ctime:启动时间
 * mtime:更新时间
 * work_directory:工作目录
 */
const services = [];
async function Listen() {
    const app = new Koa();
    app.use(bodyParser());
    const router = new Router();
    router.get("/", async function (ctx, next) {
        ctx.body = {
            success: true,
            data: services
        }
    })
    router.patch("/", async function (ctx, next) {
        let body = ctx.request.body;

        let si = -1;
        let s = services.find((p, i) => {
            if (p.pid === body.pid) {
                si = i;
                return true;
            }
            return false;
        });
        let item = {
            pid: body.pid,
            workers: body.workers,
            hostname: body.hostname || "0.0.0.0",
            port: body.port,
            name: body.name || "",
            debug: body.debug || false,
            cors: body.cors || false,
            work_directory: body.work_directory,
            ctime: body.ctime,
            mtime: Date.now()
        }
        if (s) {
            services[si] = item;
        }
        else {
            services.push(item);
        }
        ctx.body = { success: true }
    });
    app.use(router.routes());
    
    let server;
    if (typeof listen_host === "string") {
        server=app.listen(listen_host)
    }
    else {
        server=app.listen(listen_host.port, listen_host.hostname);
    }
    server.addListener("error",function(err){
        process.exit();
    });
    setInterval(function () {
        for (let i = services.length - 1; i >= 0; i--) {
            let x = services[i];
            if (Date.now() - x.mtime > 10 * 1000) {
                services.splice(i, 1)
            }
        }

    }, 500);
}

function createRequestOptions(options) {
    if (typeof listen_host === "string") {
        return Object.assign(options, { socketPath: listen_host })
    }
    else {
        return Object.assign(options, listen_host);
    }
}
async function request(options, body, callback) {
    // 创建请求
    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            if (callback && callback.apply) {
                callback(undefined, {
                    statusCode: res.statusCode,
                    data: data
                });
            }
        });
    });

    // 错误处理
    req.on('error', (err) => {
        //console.log("网错误",err)
        callback(err);
    });
    if (body) {
        req.write(body);
    }
    // 发送请求
    req.end();
}
request.get = function (path) {
    const options = createRequestOptions({
        path: path,
        method: 'GET'
    });
    return new Promise(function (resolve, reject) {
        request(options, undefined, function (err, response) {
            if (err) {
                reject(err);
            }
            else {
                resolve(response);
            }
        })
    })
}
request.patch = function (path, data) {
    let body = JSON.stringify(data);
    const options = createRequestOptions({
        //socketPath: listen_path,
        //hostname: "127.0.0.2",
        //port: 8888,
        path: path,
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    });
    return new Promise(function (resolve, reject) {
        request(options, body, function (err, response) {
            if (err) {
                //resolve();
                reject(err);
            }
            else {
                resolve(response);
            }
        })
    });

}
function start_status_server() {
    let node=process.argv[0];
    let js=process.argv[1];
    js=path.dirname(js);
    js=path.join(js,"status.server.js");
    const child = spawn(node, [js], {
        detached: true,
        stdio: 'ignore',
    });

    
    child.unref();
}
function sync_status(options) {
    // 启动服务
    start_status_server();
    let item = {
        pid: options.pid,
        workers: options.workers,
        hostname: options.hostname || "0.0.0.0",
        port: options.port,
        name: options.name || "",
        debug: options.debug || false,
        cors: options.cors || false,
        work_directory: options.work_directory,
        ctime: Date.now()
    }
    setInterval(() => {
        request.patch("/", item).catch(e => { })
    }, 500);
}
function table(input) {
    //const Console=console.Console;
    // @see https://stackoverflow.com/a/67859384
    const ts = new Transform({ transform(chunk, enc, cb) { cb(null, chunk) } })
    const logger = new Console({ stdout: ts })
    logger.table(input)
    const table = (ts.read() || '').toString()
    let rows = []
    for (let row of table.split(/[\r\n]+/)) {
        let r = row.replace(/[^┬]*┬/, '┌');
        r = r.replace(/^├─*┼/, '├');
        r = r.replace(/│[^│]*/, '');
        r = r.replace(/^└─*┴/, '└');
        r = r.replace(/'/g, ' ');
        //result += `${r}\n`;
        rows.push(r)
    }
    console.log(rows.join("\n").replace(/\n$/, ''));
}
module.exports = {
    Listen,
    request,
    sync_status,
    table
}