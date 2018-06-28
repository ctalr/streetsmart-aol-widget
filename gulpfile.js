var gulp = require('gulp');
var babel = require('gulp-babel');
var replace = require('gulp-replace');
var livereload = require('gulp-livereload');
var webserver = require('gulp-webserver');
require('dotenv').config();

console.log('> WIDGET DIRECTORY: ', process.env.WIDGET_DIR);
console.log('> REMOTE DIRECTORY: ', process.env.REMOTE_DIR);


gulp.task('compile-proxy', function() {
    // Copy everything to dist/proxy
    const task = gulp.src(['proxy/**/*.*'], { base: 'proxy' })
        .pipe(replace('{{{REMOTE_DIR}}}', process.env.REMOTE_DIR))
        .pipe(gulp.dest('dist/proxy'));

    if (process.env.WIDGET_DIR) {
        console.log('> PIPING TO WIDGET DIR')
        task.pipe(gulp.dest(process.env.WIDGET_DIR));
    }
});

gulp.task('build-content', function() {
    console.log('buid content');
    return gulp.src([
        'content/**/*.js', '!**/*___jb_old___'
    ])
        .pipe(babel())
        .pipe(gulp.dest('dist/content'))
});

gulp.task('reload', function() {
    return gulp.src(['dist/content/**/*.js']).pipe(livereload());
});

gulp.task('default', ['babel']);

gulp.task('watch', function() {
    livereload.listen();
    gulp.src('dist/content')
        .pipe(webserver({
            host: 'localhost',
            port: 3001,
        }));
    gulp.watch(['content/**/*.*'], ['build-content', 'reload']);
});