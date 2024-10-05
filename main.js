#!/usr/bin/env node

const Linq = require("linq2mysql"), server = require("./server"), fs = require("fs"), os = require('os'), cluster = require('cluster'), path = require("path");
const package = require("./package.json"), { mysqlPath } = require("@zsea/amis-server");
const { Command } = require('commander');

const program = new Command();
function command_helper(command) {
    return command.option("-h,--hostname [string]", "the listening hostname.", "::")
        .option("-d, --db <string>", "the database connection string.")
        .option("--db:type [string]", "the database type, only MySQL is supported.", "mysql")
        .option("-p, --port [number]", "web service port.", 8080)
        .option("-s, --secret [string]", "secret key used for generating tokens.", "hadmin")
        .option("-r, --router [string...]", "custom route file.", [])
        .option("-n, --name [string]", "the service name.")
        .option("-i, --workers [number|string]", "number of worker processes.")
        .option("--logo [string]", "custom logo icon file.")
        .option("--cookie [string]", "the name of the cookie for storing tokens.", "h-token")
        .option("--asar [string]", "asar file path")
        .option("-c, --config <string>", "path to the configuration file. the configuration file must be in JSON format.")
        .option("--proxy [boolean]", "is it located behind a proxy server, such as Nginx?", false)
        .option("--debug [boolean]", "print sql debug information.", false)
        .option("--cors [boolean]", "allow cross-origin access.", false)
        .option("--log [boolean]", "print web request log.", false)
        .option("--services [string...]", "customized service", [])
        ;
}
program.name("hadmin")
    .description('Create an administrative backend with a single command.')
    .version(package.version);
command_helper(program.command("start")
    .description("Launch the management backend."))
    .action(function (options) {
        const opt = Object.assign({}, options);
        if (isNaN(opt.port)) {
            console.log(`error: option '-p, --port' must is a number.`);
        }
        opt.port = parseInt(opt.port)
        Start(opt)
    })
    ;
command_helper(program.command("install")
    .description("Install as a system service."))
    .option("--user [string]", "User for starting the service.", "nobody")
    .option("--group [string]", "User group for starting the service.", "nobody")
    .option("--restart <string>", "Service restart parameter settings.", "always")
    .option("-a, --auto [boolean]", "Whether to automatically start at boot time.", false)
    .action(function (options) {
        if (os.platform() !== "linux") {
            console.log(`error: Only supports Linux`);
            process.exit();
        }
        if (!options["name"] || !options["name"].length) {
            console.log(`error: option '-n, --name' can't empty.`);
            process.exit();
        }
        const opt = Object.assign({}, options);
        if (isNaN(opt.port)) {
            console.log(`error: option '-p, --port' must is a number.`);
            process.exit();
        }
        opt.port = parseInt(opt.port)
        const argv = [process.argv[0], process.argv[1], "start"];
        argv[2] = "start"
        for (const key in opt) {
            if(["restart","auto","group","user"].includes(key)) continue;
            const v = opt[key];
            if (v === true) {
                argv.push("--" + key);
            }
            else if(v===false){
                continue;
            }
            else if (Array.isArray(v)) {
                for (const item of v) {
                    argv.push("--" + key);
                    argv.push(item);
                }
            }
            else {
                argv.push("--" + key);
                argv.push(opt[key]);
            }

        }
        const services = [
            "[Unit]",
            "Description=HAdmin Service",
            "After=network.target",
            "",
            "[Service]",
            `ExecStart=${argv.join(' ')}`,
            `WorkingDirectory=${process.cwd()}`,
            `User=${opt.user}`,
            `Group=${opt.group}`,
            `Restart=${opt.restart}`,
            "",
            "[Install]",
            "WantedBy=multi-user.target"
        ];
        fs.writeFileSync(`/etc/systemd/system/${opt.name}.service`, services.join("\n"));
        fs.chmod(`/etc/systemd/system/${opt.name}.service`, 755, function () { })
        if (opt.auto) {
            fs.symlink(`/etc/systemd/system/${opt.name}.service`, `/etc/systemd/system/multi-user.target.wants/${opt.name}.service`, "file", function () { });
        }
        console.log(`The service has been installed successfully. \nYou need to use systemctl daemon-reload and systemctl start ${opt.name}.service to start the service.`);
    })
    ;
program.command("init")
    .description("Initialize the database structure.")
    .requiredOption("-d, --db <string>", "the database connection string.")
    .option("--db:type [string]", "the database type, only MySQL is supported.", "mysql")
    .action(function (options) {
        Init(options);
    });
program.command("status")
    .description("show the status of the specified instance.").action(Status)
async function Start(options) {
    if (options["config"]) {
        const config = options["config"]
        const txt = await fs.promises.readFile(options["config"], { encoding: "utf-8" });
        options = JSON.parse(txt);
        options["config"] = config;
    }
    if (!options["db"]) {
        console.log("required option '-d, --db' not specified");
        return;
    }

    if (options.workers && cluster.isPrimary) {

        // const USER_HOME = process.env.HOME || process.env.USERPROFILE;
        // const dir = path.join(USER_HOME, ".hadmin/runing");
        // await fs.mkdir(dir, { recursive: true });
        // const pidFile = path.join(dir, process.pid + ".pid");
        // await fs.rm(pidFile).catch(() => { });
        // const file = await fsSync.openSync(pidFile, "wx");
        // fsSync.writeFileSync(file, JSON.stringify(options));
        // ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGABRT', 'SIGTERM'].forEach(function (signal) {
        //     process.addListener(signal, function () {
        //         fsSync.writeFileSync(file,"xxxxx");
        //         //fs.writeFile
        //         fsSync.closeSync(file)
        //         try {
        //             fsSync.unlinkSync(pidFile);
        //         }
        //         catch (e) {
        //             console.error(e);
        //         }
        //         finally {
        //             process.exit();
        //         }

        //     });
        // });

        let nums = options.workers === "max" ? os.cpus().length : Number(options.workers);
        if (isNaN(nums)) {
            console.log("option '-i, --workers' error");
            return
        }
        function daemon(worker) {
            worker.addListener("exit", function () {
                let _worker_ = cluster.fork();
                daemon(_worker_);
            });
        }
        for (let i = 0; i < nums; i++) {
            let worker = cluster.fork();
            daemon(worker);
        }
        // process.addListener("SIGPIPE", function () {
        //     console.log("SIGPIPE")
        // });
        return
    }

    options.db = new Linq(options.db, function logger(sql) {
        if (options["debug"]) {
            console.log(sql);
        }
    });
    if (options.dbs) {
        const dbs = {};
        for (let key in options.dbs) {
            dbs[key] = new Linq(options.dbs[key]);
        }
        options.dbs = dbs;
    }
    server.Startup(options);
}
async function Init(options) {
    const sql = await fs.promises.readFile(mysqlPath, { encoding: "utf-8" });
    const db = new Linq(options.db);
    await db.execute(sql);
    console.log('[HAdmin] Database initialization complete.');
    process.exit()
}
async function Status(options) {
    const USER_HOME = process.env.HOME || process.env.USERPROFILE;
    const pidPath = path.join(USER_HOME, ".hadmin/runing");
    const pids = (await fs.promises.readdir(pidPath)).filter(x => x.endsWith(".pid")).map(x => Number(x.replace(".pid", "")));
    pids.forEach(pid => process.kill(pid, "SIGPIPE"))

}
program.parse();

if (program.args.length === 0) {
    program.help();
    return;
}
