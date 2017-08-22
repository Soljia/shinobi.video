$('.date').text(editor.date())
editor.linkID=function(x){
    return x.toLowerCase().replace(/(\r\n|\n|\r)/gm,"").replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi, '').replace(/ /g,'-').replace('----','');
}
window.addEventListener('load', function() {
    editor.app = ContentTools.EditorApp.get();
    editor.app.init('*[data-editable]', 'data-name');
    ContentTools.StylePalette.add([
        new ContentTools.Style('Author', 'author', ['p'])
    ]);
    editor.app.addEventListener('saved', function (ev) {
        ev._this=this
        formData={date:editor.date(),id:moment(editor.date()).format('YYYY-MM-DD')+'-'+editor.linkID($('.page__heading').text())}
        //get data
        $('[data-name]').each(function(n,v){
            var item = $(v).attr('data-name')
            formData[item]=v.innerHTML;
            if(item==='page__heading'){
                formData.title=$(v).text()
            }
        })
        ev._this.busy(true);
        $.post('/articles/new',{data:JSON.stringify(formData)},function(d){
           if(d.ok===true){
               if(!window.editing){
                   location.href=d.href;
               }
           }else{
               new ContentTools.FlashUI('no');
           }
           ev._this.busy(false);
        })
    });
});

$(window).bind('keydown', function(event) {
    if (event.ctrlKey || event.metaKey) {
        if(String.fromCharCode(event.which).toLowerCase()==='s'){
            event.preventDefault();
            if($('.ct-ignition--editing').length>0)
                $('.ct-ignition__button--confirm').click()
            else
                $('.ct-ignition__button--edit').click()
        }
    }
});;