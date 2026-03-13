"use strict";
//
// 除非确知其用途，请勿修改或删除本文件
//
// 本文件提供运行扩展测试时使用的测试运行器，默认使用基于 Mocha 的测试运行器。
// 若需自定义测试运行器，可导出一个函数 run(testRoot: string, clb: (error:Error) => void)，
// 扩展宿主会调用该函数执行测试；测试运行器应使用 console.log 将结果回传给调用方，
// 测试结束后通过回调返回错误对象或 null。
//
var testRunner = require('vscode/lib/testrunner');
// 可通过取消下列行的注释来直接配置 Mocha 选项
// 参见 https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options
testRunner.configure({
    ui: 'tdd',
    useColors: true // 测试结果彩色输出
});
module.exports = testRunner;
//# sourceMappingURL=index.js.map