import {NamedPage, addPage} from '@hydrooj/ui-default';
addPage (new NamedPage ('home_account', () => {
	var btn = document.getElementsByClassName("change-avatar button rounded primary")[0];
	btn.addEventListener('click', function (e){
		var sel = document.getElementById("type");
		sel.options.remove(3); // 取消上传头像
		// sel.options.remove(2); // 取消获取 qq 头像
		sel.options.remove(1); // 取消获取 github 头像
		//sel.options.remove(0); // 取消获取 gravatar 头像
		var plh = document.getElementsByClassName("textbox")[0];
		plh.placeholder = "Email address";
	});
}));