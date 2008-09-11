require 'rake'
require 'rake/testtask'
require 'rake/rdoctask'

task :test do
  output = `ruby test/mock_bosh_service.rb`
  puts "\n#{output}"
end

task :default => :test do
end

task 'test:stop' do
  pid = `ps -A | grep mock_bosh_service.rb | grep -v grep`
  fail "Process not found" if pid.empty?
  pid = pid[/^\s+\d+\s/].strip.to_i
  Process.kill('INT', pid)
  puts "\n=> Webrick stopped"
end
