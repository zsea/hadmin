const server = require("./server"),Linq=require("linq2mysql");
const db=new Linq("mysql://root@127.0.0.1/amis")
server.Startup({ port: 1999,db:db });