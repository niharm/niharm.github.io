import sys

if len(sys.argv) > 1:
	file_name = sys.argv[1];
else:
	file_name = 'sandbox'

with open(file_name + '.ck', 'r') as chuck_file:

	master_string = "var code = \""

	for line in chuck_file:
		master_string += line.replace('\n', '\\n').replace('    ', ' ').replace("\"", "\\\"")

	master_string += '\"'

write_file = open(file_name + '.js', 'w') 
write_file.write(master_string)
print master_string
